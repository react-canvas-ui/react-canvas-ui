// @ts-nocheck
import { Texture, BaseTexture, RenderTexture, Renderer, MaskData } from '@pixi/core';
import { Sprite } from '@pixi/sprite';
import { Container, DisplayObject, IDestroyOptions } from '@pixi/display';
import { IPointData, Matrix, Rectangle } from '@pixi/math';
import { uid } from '@pixi/utils';
import { settings } from '@pixi/settings';
import { CanvasRenderer } from '@pixi/canvas-renderer';

const _tempMatrix = new Matrix();

DisplayObject.prototype._cacheAsBitmap = false;
DisplayObject.prototype._cacheData = null;

// figured there's no point adding ALL the extra variables to prototype.
// this model can hold the information needed. This can also be generated on demand as
// most objects are not cached as bitmaps.
/**
 * @class
 * @ignore
 * @private
 */
export class CacheData
{
    public textureCacheId: string;
    public originalRender: (renderer: Renderer) => void;
    public originalRenderCanvas: (renderer: CanvasRenderer) => void;
    public originalCalculateBounds: () => void;
    public originalGetLocalBounds: (rect?: Rectangle) => Rectangle;
    public originalUpdateTransform: () => void;
    public originalDestroy: (options?: IDestroyOptions|boolean) => void;
    public originalMask: Container|MaskData;
    public originalFilterArea: Rectangle;
    public originalContainsPoint: (point: IPointData) => boolean;
    public sprite: Sprite;

    constructor()
    {
        this.textureCacheId = null;

        this.originalRender = null;
        this.originalRenderCanvas = null;
        this.originalCalculateBounds = null;
        this.originalGetLocalBounds = null;

        this.originalUpdateTransform = null;
        this.originalDestroy = null;
        this.originalMask = null;
        this.originalFilterArea = null;
        this.originalContainsPoint = null;
        this.sprite = null;
    }
}

Object.defineProperties(DisplayObject.prototype, {
    /**
     * Set this to true if you want this display object to be cached as a bitmap.
     * This basically takes a snap shot of the display object as it is at that moment. It can
     * provide a performance benefit for complex static displayObjects.
     * To remove simply set this property to `false`
     *
     * IMPORTANT GOTCHA - Make sure that all your textures are preloaded BEFORE setting this property to true
     * as it will take a snapshot of what is currently there. If the textures have not loaded then they will not appear.
     *
     * @member {boolean}
     * @memberof PIXI.DisplayObject#
     */
    cacheAsBitmap: {
        get(): CacheData
        {
            return this._cacheAsBitmap;
        },
        set(value: CacheData): void
        {
            if (this._cacheAsBitmap === value)
            {
                return;
            }

            this._cacheAsBitmap = value;

            let data: CacheData;

            if (value)
            {
                if (!this._cacheData)
                {
                    this._cacheData = new CacheData();
                }

                data = this._cacheData;

                data.originalRender = this.render;
                data.originalRenderCanvas = this.renderCanvas;

                data.originalUpdateTransform = this.updateTransform;
                data.originalCalculateBounds = this.calculateBounds;
                data.originalGetLocalBounds = this.getLocalBounds;

                data.originalDestroy = this.destroy;

                data.originalContainsPoint = this.containsPoint;

                data.originalMask = this._mask;
                data.originalFilterArea = this.filterArea;

                this.render = this._renderCached;
                this.renderCanvas = this._renderCachedCanvas;

                this.destroy = this._cacheAsBitmapDestroy;
            }
            else
            {
                data = this._cacheData;

                if (data.sprite)
                {
                    this._destroyCachedDisplayObject();
                }

                this.render = data.originalRender;
                this.renderCanvas = data.originalRenderCanvas;
                this.calculateBounds = data.originalCalculateBounds;
                this.getLocalBounds = data.originalGetLocalBounds;

                this.destroy = data.originalDestroy;

                this.updateTransform = data.originalUpdateTransform;
                this.containsPoint = data.originalContainsPoint;

                this._mask = data.originalMask;
                this.filterArea = data.originalFilterArea;
            }
        },
    },
});

/**
 * Renders a cached version of the sprite with WebGL
 *
 * @private
 * @method _renderCached
 * @memberof PIXI.DisplayObject#
 * @param {PIXI.Renderer} renderer - the WebGL renderer
 */
DisplayObject.prototype._renderCached = function _renderCached(renderer: Renderer): void
{
    if (!this.visible || this.worldAlpha <= 0 || !this.renderable)
    {
        return;
    }

    this._initCachedDisplayObject(renderer);

    this._cacheData.sprite.transform._worldID = this.transform._worldID;
    this._cacheData.sprite.worldAlpha = this.worldAlpha;
    (this._cacheData.sprite as any)._render(renderer);
};

/**
 * Prepares the WebGL renderer to cache the sprite
 *
 * @private
 * @method _initCachedDisplayObject
 * @memberof PIXI.DisplayObject#
 * @param {PIXI.Renderer} renderer - the WebGL renderer
 */
DisplayObject.prototype._initCachedDisplayObject = function _initCachedDisplayObject(renderer: Renderer): void
{
    if (this._cacheData && this._cacheData.sprite)
    {
        return;
    }

    // make sure alpha is set to 1 otherwise it will get rendered as invisible!
    const cacheAlpha = this.alpha;

    this.alpha = 1;

    // first we flush anything left in the renderer (otherwise it would get rendered to the cached texture)
    renderer.batch.flush();
    // this.filters= [];

    // next we find the dimensions of the untransformed object
    // this function also calls updatetransform on all its children as part of the measuring.
    // This means we don't need to update the transform again in this function
    // TODO pass an object to clone too? saves having to create a new one each time!
    const bounds = (this as Container).getLocalBounds(null, true).clone();

    // add some padding!
    if (this.filters)
    {
        const padding = this.filters[0].padding;

        bounds.pad(padding);
    }
    bounds.ceil(renderer.resolution);

    // for now we cache the current renderTarget that the WebGL renderer is currently using.
    // this could be more elegant..
    const cachedRenderTexture = renderer.renderTexture.current;
    const cachedSourceFrame = renderer.renderTexture.sourceFrame.clone();
    const cachedProjectionTransform = renderer.projection.transform;

    // We also store the filter stack - I will definitely look to change how this works a little later down the line.
    // const stack = renderer.filterManager.filterStack;

    // this renderTexture will be used to store the cached DisplayObject
    const renderTexture = RenderTexture.create({ width: bounds.width, height: bounds.height, resolution: renderer.resolution, scaleMode: 1, mipmap: 2 });
    const textureCacheId = `cacheAsBitmap_${uid()}`;

    this._cacheData.textureCacheId = textureCacheId;

    BaseTexture.addToCache(renderTexture.baseTexture, textureCacheId);
    Texture.addToCache(renderTexture, textureCacheId);

    // need to set //
    const m = this.transform.localTransform.copyTo(_tempMatrix).invert().translate(-bounds.x, -bounds.y);

    // set all properties to there original so we can render to a texture
    this.render = this._cacheData.originalRender;

    renderer.render(this, renderTexture, true, m, false);

    // now restore the state be setting the new properties
    renderer.projection.transform = cachedProjectionTransform;
    renderer.renderTexture.bind(cachedRenderTexture, cachedSourceFrame);

    // renderer.filterManager.filterStack = stack;

    this.render = this._renderCached;
    // the rest is the same as for Canvas
    this.updateTransform = this.displayObjectUpdateTransform;
    this.calculateBounds = this._calculateCachedBounds;
    this.getLocalBounds = this._getCachedLocalBounds;

    this._mask = null;
    this.filterArea = null;

    // create our cached sprite
    const cachedSprite = new Sprite(renderTexture);

    cachedSprite.transform.worldTransform = this.transform.worldTransform;
    cachedSprite.anchor.x = -(bounds.x / bounds.width);
    cachedSprite.anchor.y = -(bounds.y / bounds.height);
    cachedSprite.alpha = cacheAlpha;
    cachedSprite._bounds = this._bounds;

    this._cacheData.sprite = cachedSprite;

    this.transform._parentID = -1;
    // restore the transform of the cached sprite to avoid the nasty flicker..
    if (!this.parent)
    {
        this.enableTempParent();
        this.updateTransform();
        this.disableTempParent(null);
    }
    else
    {
        this.updateTransform();
    }

    // map the hit test..
    (this as Sprite).containsPoint = cachedSprite.containsPoint.bind(cachedSprite);
};

/**
 * Renders a cached version of the sprite with canvas
 *
 * @private
 * @method _renderCachedCanvas
 * @memberof PIXI.DisplayObject#
 * @param {PIXI.CanvasRenderer} renderer - The canvas renderer
 */
DisplayObject.prototype._renderCachedCanvas = function _renderCachedCanvas(renderer: CanvasRenderer): void
{
    if (!this.visible || this.worldAlpha <= 0 || !this.renderable)
    {
        return;
    }

    this._initCachedDisplayObjectCanvas(renderer);

    this._cacheData.sprite.worldAlpha = this.worldAlpha;
    (this._cacheData.sprite as any)._renderCanvas(renderer);
};

// TODO this can be the same as the WebGL version.. will need to do a little tweaking first though..
/**
 * Prepares the Canvas renderer to cache the sprite
 *
 * @private
 * @method _initCachedDisplayObjectCanvas
 * @memberof PIXI.DisplayObject#
 * @param {PIXI.CanvasRenderer} renderer - The canvas renderer
 */
DisplayObject.prototype._initCachedDisplayObjectCanvas = function _initCachedDisplayObjectCanvas(
    renderer: CanvasRenderer
): void
{
    if (this._cacheData && this._cacheData.sprite)
    {
        return;
    }

    // get bounds actually transforms the object for us already!
    const bounds = (this as Container).getLocalBounds(null, true);

    const cacheAlpha = this.alpha;

    this.alpha = 1;

    const cachedRenderTarget = renderer.context;
    const cachedProjectionTransform = (renderer as any)._projTransform;

    bounds.ceil(settings.RESOLUTION);

    const renderTexture = RenderTexture.create({ width: bounds.width, height: bounds.height });

    const textureCacheId = `cacheAsBitmap_${uid()}`;

    this._cacheData.textureCacheId = textureCacheId;

    BaseTexture.addToCache(renderTexture.baseTexture, textureCacheId);
    Texture.addToCache(renderTexture, textureCacheId);

    // need to set //
    const m = _tempMatrix;

    this.transform.localTransform.copyTo(m);
    m.invert();

    m.tx -= bounds.x;
    m.ty -= bounds.y;

    // m.append(this.transform.worldTransform.)
    // set all properties to there original so we can render to a texture
    this.renderCanvas = this._cacheData.originalRenderCanvas;

    renderer.render(this, renderTexture, true, m, false);
    // now restore the state be setting the new properties
    renderer.context = cachedRenderTarget;
    (renderer as any)._projTransform = cachedProjectionTransform;

    this.renderCanvas = this._renderCachedCanvas;
    // the rest is the same as for WebGL
    this.updateTransform = this.displayObjectUpdateTransform;
    this.calculateBounds = this._calculateCachedBounds;
    this.getLocalBounds = this._getCachedLocalBounds;

    this._mask = null;
    this.filterArea = null;

    // create our cached sprite
    const cachedSprite = new Sprite(renderTexture);
    const fxaa = new FXAAFilter()
    fxaa.resolution = 4
    cachedSprite.filters = [ fxaa ]

    cachedSprite.transform.worldTransform = this.transform.worldTransform;
    cachedSprite.anchor.x = -(bounds.x / bounds.width);
    cachedSprite.anchor.y = -(bounds.y / bounds.height);
    cachedSprite.alpha = cacheAlpha;
    cachedSprite._bounds = this._bounds;

    this._cacheData.sprite = cachedSprite;

    this.transform._parentID = -1;
    // restore the transform of the cached sprite to avoid the nasty flicker..
    if (!this.parent)
    {
        this.parent = (renderer as any)._tempDisplayObjectParent;
        this.updateTransform();
        this.parent = null;
    }
    else
    {
        this.updateTransform();
    }

    // map the hit test..
    (this as Sprite).containsPoint = cachedSprite.containsPoint.bind(cachedSprite);
};

/**
 * Calculates the bounds of the cached sprite
 *
 * @private
 * @method
 */
DisplayObject.prototype._calculateCachedBounds = function _calculateCachedBounds(): void
{
    this._bounds.clear();
    this._cacheData.sprite.transform._worldID = this.transform._worldID;
    (this._cacheData.sprite as any)._calculateBounds();
    this._bounds.updateID = (this as any)._boundsID;
};

/**
 * Gets the bounds of the cached sprite.
 *
 * @private
 * @method
 * @return {Rectangle} The local bounds.
 */
DisplayObject.prototype._getCachedLocalBounds = function _getCachedLocalBounds(): Rectangle
{
    return this._cacheData.sprite.getLocalBounds(null);
};

/**
 * Destroys the cached sprite.
 *
 * @private
 * @method
 */
DisplayObject.prototype._destroyCachedDisplayObject = function _destroyCachedDisplayObject(): void
{
    this._cacheData.sprite._texture.destroy(true);
    this._cacheData.sprite = null;

    BaseTexture.removeFromCache(this._cacheData.textureCacheId);
    Texture.removeFromCache(this._cacheData.textureCacheId);

    this._cacheData.textureCacheId = null;
};

/**
 * Destroys the cached object.
 *
 * @private
 * @method
 * @param {object|boolean} [options] - Options parameter. A boolean will act as if all options
 *  have been set to that value.
 *  Used when destroying containers, see the Container.destroy method.
 */
DisplayObject.prototype._cacheAsBitmapDestroy = function _cacheAsBitmapDestroy(options?: IDestroyOptions|boolean): void
{
    this.cacheAsBitmap = false;
    this.destroy(options);
};

declare global {

    namespace GlobalMixins
    {
        interface DisplayObject {
            cacheAsBitmap?: boolean;
            _cacheAsBitmap?: boolean;
            _cacheData?: CacheData;
            _renderCached?: (renderer: import('@pixi/core').Renderer) => void;
            _initCachedDisplayObject?: (renderer: import('@pixi/core').Renderer) => void;
            _calculateCachedBounds?: () => void;
            _getCachedLocalBounds?: () => import('@pixi/math').Rectangle;
            _renderCachedCanvas?: (renderer: import('@pixi/canvas-renderer').CanvasRenderer) => void;
            _initCachedDisplayObjectCanvas?: (renderer: import('@pixi/canvas-renderer').CanvasRenderer) => void;
            _destroyCachedDisplayObject?: () => void;
            _cacheAsBitmapDestroy?: (options?: import('@pixi/display').IDestroyOptions|boolean) => void;
        }
    }
    
}
