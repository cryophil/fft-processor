import React, { useRef, useEffect } from 'react';

const CanvasDisplay = ({ data, width, height, overlays, activeTool, viewState, onZoom, onPan, onReset, isCtrlDown, onHover }) => {
    const canvasRef = useRef(null);
    // Use provided viewState
    const currentViewState = viewState;

    const isPanning = useRef(false);
    const [isGrabbing, setIsGrabbing] = React.useState(false); // For cursor state during drag
    const lastMouse = useRef({ x: 0, y: 0 });
    const offscreenCanvasRef = useRef(null);

    // 1. Cache Image Data when data/dimensions change
    useEffect(() => {
        if (!data || !width || !height) return;

        // Initialize offscreen canvas if needed
        if (!offscreenCanvasRef.current) {
            offscreenCanvasRef.current = document.createElement('canvas');
        }
        const offscreen = offscreenCanvasRef.current;

        // Only update if dimensions or data changed
        if (offscreen.width !== width || offscreen.height !== height) {
            offscreen.width = width;
            offscreen.height = height;
        }

        const ctx = offscreen.getContext('2d');
        const imgData = ctx.createImageData(width, height);
        const buf = imgData.data;

        for (let i = 0; i < width * height; i++) {
            let val = data[i];
            // Simple clamp
            if (val < 0) val = 0;
            if (val > 1) val = 1;
            const v = (val * 255) | 0; // Bitwise floor for minor speedup

            const idx = i << 2; // i * 4
            buf[idx] = v;
            buf[idx + 1] = v;
            buf[idx + 2] = v;
            buf[idx + 3] = 255;
        }
        ctx.putImageData(imgData, 0, 0);

    }, [data, width, height]);

    // 2. Render View when viewState/overlays change
    useEffect(() => {
        if (!width || !height || !offscreenCanvasRef.current) return;

        const canvas = canvasRef.current;
        // Don't resize canvas on every frame if not needed (it causes clear)
        // Check if size matches
        if (canvas.width !== width || canvas.height !== height) {
            canvas.width = width;
            canvas.height = height;
        }

        const ctx = canvas.getContext('2d', { alpha: false }); // alpha: false can speed up if opaque

        // Because resizing clears, we only clear if we didn't resize.
        // Actually, just drawing full rect is fine, specifically clearRect is good practice.
        ctx.save();
        ctx.clearRect(0, 0, width, height);

        // Background fill (optional, keeps it clean if zoomed out)
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, width, height);

        // Apply View Transform
        ctx.translate(width / 2 + currentViewState.offsetX, height / 2 + currentViewState.offsetY);
        ctx.scale(currentViewState.scale, currentViewState.scale);
        ctx.translate(-width / 2, -height / 2);

        // Draw Cached Image
        // Use imageSmoothingEnabled = false for pixelated look (already set on canvas style usually, but explicit here is good)
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(offscreenCanvasRef.current, 0, 0);

        // Draw Overlays
        if (overlays) {
            ctx.save();

            ctx.fillStyle = 'rgba(0, 255, 0, 0.15)'; // Reduced from 0.3
            ctx.strokeStyle = 'rgba(0, 255, 0, 0.5)'; // Reduced opacity slightly
            ctx.lineWidth = 1 / currentViewState.scale; // Keep line width constant in screen pixels

            // Draw Overlays
            const { active, spots, centeredDonut } = overlays;

            // Render Centered Donut if it exists
            if (centeredDonut && centeredDonut.enabled) {
                ctx.beginPath();
                ctx.arc(width / 2, height / 2, centeredDonut.rmax, 0, Math.PI * 2);
                ctx.arc(width / 2, height / 2, centeredDonut.rmin, 0, Math.PI * 2, true);
                ctx.fill();
            }


            // Draw active donut being created
            if (active) {
                const rmin = Math.min(active.r1, active.r2);
                const rmax = Math.max(active.r1, active.r2);

                ctx.beginPath();
                ctx.arc(active.cx, active.cy, rmax, 0, Math.PI * 2);
                ctx.arc(active.cx, active.cy, rmin, 0, Math.PI * 2, true);
                ctx.fillStyle = 'rgba(0, 255, 0, 0.1)'; // Reduced from 0.3
                ctx.fill();
                ctx.lineWidth = 1 / currentViewState.scale; // Ensure thin line regardless of zoom
                ctx.stroke();
            }

            // Draw spot points
            if (spots && spots.length > 0) {
                // Ensure spots are red and visible
                ctx.fillStyle = 'rgba(255, 0, 0, 0.1)'; // Waaaaay more transparent (0.7 -> 0.1)
                spots.forEach(p => {
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, p.size || 5, 0, Math.PI * 2);
                    ctx.fill();
                });
            }

            ctx.restore();
        }

        ctx.restore();
    }, [width, height, overlays, currentViewState, data]); // data dependency to trigger redraw if data changes (cached canvas updates)

    const handleWheel = (e) => {
        e.preventDefault();
        const delta = -e.deltaY;

        if (onZoom) {
            onZoom(delta);
        }
    };

    const handleMouseDown = (e) => {
        // Panning is triggered by:
        // 1. Middle click (button 1)
        // 2. Any click while Ctrl or Meta is held (handles Mac Ctrl+LeftClick which may report button 2)
        if (e.button === 1 || e.ctrlKey || e.metaKey) {
            isPanning.current = true;
            setIsGrabbing(true);
            lastMouse.current = { x: e.clientX, y: e.clientY };
            e.preventDefault(); // Prevent text selection etc
        }
    };

    const handleMouseMove = (e) => {
        if (isPanning.current) {
            // Calculate display ratio to match screen pixels to image pixels 1:1
            // displayRatio = internal_resolution / onscreen_size
            const rect = canvasRef.current.getBoundingClientRect();
            const ratioX = width / rect.width;
            const ratioY = height / rect.height;

            // 1:1 Panning (Grab effect) - Apply ratio
            const dx = (e.clientX - lastMouse.current.x) * ratioX;
            const dy = (e.clientY - lastMouse.current.y) * ratioY;

            if (onPan) {
                onPan(dx, dy);
            }
            lastMouse.current = { x: e.clientX, y: e.clientY };
        }

        // Tooltip Tracking
        if (onHover) {
            const rect = canvasRef.current.getBoundingClientRect();
            const rawX = e.clientX - rect.left;
            const rawY = e.clientY - rect.top;

            const ratioX = width / rect.width;
            const ratioY = height / rect.height;
            const canvasX = rawX * ratioX;
            const canvasY = rawY * ratioY;

            const centerX = width / 2;
            const centerY = height / 2;

            // Re-use logic from App.jsx getImgCoords (but integrated here)
            const x_img = Math.round((canvasX - (centerX + currentViewState.offsetX)) / currentViewState.scale + centerX);
            const y_img = Math.round((canvasY - (centerY + currentViewState.offsetY)) / currentViewState.scale + centerY);

            if (x_img >= 0 && x_img < width && y_img >= 0 && y_img < height) {
                onHover({ x: x_img, y: y_img, mouseX: e.clientX, mouseY: e.clientY });
            } else {
                onHover(null);
            }
        }
    };

    const handleMouseUp = () => {
        isPanning.current = false;
        setIsGrabbing(false);
    };

    const handleMouseLeave = () => {
        isPanning.current = false;
        setIsGrabbing(false);
        if (onHover) onHover(null);
    };

    const handleDoubleClick = () => {
        if (onReset) {
            onReset();
        }
    };

    const handleContextMenu = (e) => {
        // Prevent context menu only when Ctrl or Meta is down (prevents Mac Ctrl+Click right-click)
        if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
        }
    };

    return (
        <div
            style={{
                width: '100%',
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                position: 'relative',
                userSelect: 'none',
                overflow: 'hidden'
            }}
            onWheel={handleWheel}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseLeave}
            onDoubleClick={handleDoubleClick}
            onContextMenu={handleContextMenu}
        >
            <canvas
                ref={canvasRef}
                style={{
                    maxWidth: '100%',
                    maxHeight: '100%',
                    objectFit: 'contain',
                    imageRendering: 'pixelated',
                    display: 'block',
                    margin: 'auto',
                    // Cursor Priority: Grabbing (Active Pan) > Grab (Ready to Pan - Ctrl) > Crosshair (Tool) > Default
                    cursor: isGrabbing ? 'grabbing' : (isCtrlDown ? 'grab' : (activeTool === 'donut' || activeTool === 'spot' ? 'crosshair' : 'default'))
                }}
            />
        </div>
    );
};

export default CanvasDisplay;
