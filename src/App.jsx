import React, { useState, useEffect, useCallback } from 'react';
import './index.css';
import DragDropUploader from './components/DragDropUploader';
import ControlPanel from './components/ControlPanel';
import CanvasDisplay from './components/CanvasDisplay';
import { loadImage } from './utils/imageLoader';
import { processImagePipeline, reconstructImage } from './utils/processor';

function App() {
    // ─────────────────────────────────────────────────────────────────────────────
    // State
    // ─────────────────────────────────────────────────────────────────────────────
    const [originalImage, setOriginalImage] = useState(null);
    const [params, setParams] = useState({
        gamma: 1.0,
        contrast: 1.0,
        brightness: 0.0,
        mixR: 0.33,
        mixG: 0.33,
        mixB: 0.33,
        scale: 1.0,
        analysisMode: 'empty',
    });

    const [results, setResults] = useState({
        processed: null,
        magnitude: null,
        phase: null,
        reconstruction: null
    });

    const [processing, setProcessing] = useState(false);
    const [clickCoords, setClickCoords] = useState(null);

    // FFT Tools State
    const [activeTool, setActiveTool] = useState('donut');
    const [isCtrlDown, setIsCtrlDown] = useState(false);
    const [spotSize, setSpotSize] = useState(5);
    const [centeredDonut, setCenteredDonut] = useState({ rmin: 0, rmax: 0, enabled: false });

    // Shared View State for FFT panes
    const [fftViewState, setFftViewState] = useState({ scale: 1, offsetX: 0, offsetY: 0 });

    // Filter State
    const [currentDonut, setCurrentDonut] = useState(null);
    const [spotPoints, setSpotPoints] = useState([]);
    const [hoverInfo, setHoverInfo] = useState(null);

    // ─────────────────────────────────────────────────────────────────────────────
    // Effects
    // ─────────────────────────────────────────────────────────────────────────────
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'Control' || e.key === 'Meta') setIsCtrlDown(true);
        };
        const handleKeyUp = (e) => {
            if (e.key === 'Control' || e.key === 'Meta') setIsCtrlDown(false);
        };
        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
        };
    }, []);

    // ─────────────────────────────────────────────────────────────────────────────
    // Handlers
    // ─────────────────────────────────────────────────────────────────────────────
    const resetFilters = () => {
        setCurrentDonut(null);
        setSpotPoints([]);
        setCenteredDonut({ rmin: 0, rmax: 0, enabled: false });
    };

    const handleFileUpload = async (file) => {
        setProcessing(true);
        try {
            const loaded = await loadImage(file);
            setOriginalImage(loaded);
        } catch (err) {
            console.error("Load Error:", err);
            alert("Failed to load image");
        }
        setProcessing(false);
    };

    const runReconstruction = useCallback(async (magnitude, phase, width, height) => {
        if (!magnitude || !phase) return;

        const rec = await reconstructImage(
            magnitude, phase, width, height,
            params.analysisMode,
            { spotPoints, centeredDonut }
        );

        setResults(prev => ({
            ...prev,
            reconstruction: { data: rec, width, height }
        }));
    }, [params.analysisMode, spotPoints, centeredDonut]);

    const getImgCoords = (e, width, height) => {
        const container = e.currentTarget;
        const canvas = container.querySelector('canvas');
        if (!canvas) return { x: 0, y: 0 };

        const rect = canvas.getBoundingClientRect();
        const rawX = e.clientX - rect.left;
        const rawY = e.clientY - rect.top;

        const scaleX = width / rect.width;
        const scaleY = height / rect.height;
        const canvasX = rawX * scaleX;
        const canvasY = rawY * scaleY;

        const centerX = width / 2;
        const centerY = height / 2;
        const x_img = (canvasX - (centerX + fftViewState.offsetX)) / fftViewState.scale + centerX;
        const y_img = (canvasY - (centerY + fftViewState.offsetY)) / fftViewState.scale + centerY;

        return { x: x_img, y: y_img };
    };

    const applySnapping = (dist, width, height, scale) => {
        const threshold = 20 / scale;
        if (dist < threshold) return 0;

        const edgeRadius = Math.min(width, height) / 2;
        if (Math.abs(dist - edgeRadius) < threshold) return edgeRadius;

        const cornerRadius = Math.sqrt((width / 2) ** 2 + (height / 2) ** 2);
        if (Math.abs(dist - cornerRadius) < threshold) return cornerRadius;

        return dist;
    };

    const handleFFTMousedown = (e, width, height) => {
        if (e.ctrlKey) return;

        // Wave mode
        if (params.analysisMode === 'wave') {
            const container = e.currentTarget;
            const canvas = container.querySelector('canvas');
            const rect = canvas ? canvas.getBoundingClientRect() : e.target.getBoundingClientRect();

            const x = (e.clientX - rect.left) * (width / rect.width);
            const y = (e.clientY - rect.top) * (height / rect.height);
            const u = x - width / 2;
            const v = y - height / 2;
            setClickCoords({ u, v });
            generateWave({ u, v }, width, height);
            return;
        }

        // Only allow filter tools in IFFT mode
        if (params.analysisMode !== 'ifft') return;

        const { x, y } = getImgCoords(e, width, height);
        const centerX = width / 2;
        const centerY = height / 2;

        if (activeTool === 'spot') {
            const p1 = { x, y, size: spotSize };
            const p2 = { x: width - x, y: height - y, size: spotSize };

            setCenteredDonut(prev => ({ ...prev, enabled: false }));

            setSpotPoints(prev => {
                const next = [...prev, p1, p2];
                return next.length > 6 ? next.slice(-6) : next;
            });
            return;
        }

        if (activeTool === 'donut') {
            if (e.shiftKey) {
                setCenteredDonut(prev => ({ ...prev, enabled: false }));
                return;
            }

            const dist = Math.sqrt((x - centerX) ** 2 + (y - centerY) ** 2);
            setSpotPoints([]);
            const snappedDist = applySnapping(dist, width, height, fftViewState.scale);

            if (!currentDonut) {
                setCurrentDonut({ cx: centerX, cy: centerY, r1: snappedDist, r2: snappedDist });
            } else {
                const rmin = Math.min(currentDonut.r1, snappedDist);
                const rmax = Math.max(currentDonut.r1, snappedDist);
                setCenteredDonut({ rmin, rmax, enabled: true });
                setCurrentDonut(null);
            }
        }
    };

    const handleFFTMousemove = (e, width, height) => {
        if (params.analysisMode === 'wave' || e.ctrlKey) return;

        const { x, y } = getImgCoords(e, width, height);
        const centerX = width / 2;
        const centerY = height / 2;

        if (activeTool === 'donut' && currentDonut) {
            const dist = Math.sqrt((x - centerX) ** 2 + (y - centerY) ** 2);
            const snappedDist = applySnapping(dist, width, height, fftViewState.scale);
            setCurrentDonut(prev => ({ ...prev, r2: snappedDist }));
        }
    };

    const handleFftZoom = (delta) => {
        setFftViewState(prev => {
            const zoomFactor = Math.pow(1.4, delta / 100);
            return {
                ...prev,
                scale: Math.max(0.1, Math.min(prev.scale * zoomFactor, 20))
            };
        });
    };

    const handleFftPan = (dx, dy) => {
        setFftViewState(prev => ({
            ...prev,
            offsetX: prev.offsetX + dx,
            offsetY: prev.offsetY + dy
        }));
    };

    const handleFftReset = () => {
        setFftViewState({ scale: 1, offsetX: 0, offsetY: 0 });
    };

    const handleHover = useCallback((info) => {
        if (!info || !results.rawMagnitude || !results.rawPhase) {
            setHoverInfo(null);
            return;
        }

        const { x, y, mouseX, mouseY } = info;
        const width = results.magnitude.width;
        const idx = y * width + x;

        if (idx < 0 || idx >= results.rawMagnitude.length) {
            setHoverInfo(null);
            return;
        }

        const mag = results.rawMagnitude[idx];
        const phaseRad = results.rawPhase[idx];
        const phaseDeg = (phaseRad * 180 / Math.PI);

        setHoverInfo({
            mag: mag.toExponential(2),
            phase: phaseDeg.toFixed(1) + '°',
            mouseX,
            mouseY
        });
    }, [results]);

    const generateWave = (coords, width, height) => {
        const { u, v } = coords;
        const wave = new Float32Array(width * height);
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const val = Math.cos(2 * Math.PI * (u * x / width + v * y / height));
                wave[y * width + x] = val * 0.5 + 0.5;
            }
        }
        setResults(prev => ({
            ...prev,
            reconstruction: { data: wave, width, height }
        }));
    };

    const runProcessing = useCallback(async () => {
        if (!originalImage) return;
        setProcessing(true);

        try {
            const res = await processImagePipeline(originalImage, params);
            setResults(prev => ({ ...prev, ...res }));

            if (params.analysisMode === 'wave') {
                if (clickCoords) {
                    generateWave(clickCoords, res.processed.width, res.processed.height);
                } else {
                    setResults(prev => ({ ...prev, reconstruction: null }));
                }
            } else if (params.analysisMode !== 'empty') {
                await runReconstruction(res.rawMagnitude, res.rawPhase, res.processed.width, res.processed.height);
            } else {
                setResults(prev => ({ ...prev, reconstruction: null }));
            }
        } catch (e) {
            console.error("Processing Error:", e);
            alert("Processing Error: " + e.message);
        }
        setProcessing(false);
    }, [originalImage, params, runReconstruction, clickCoords]);

    // Auto-run processing when image or params change
    useEffect(() => {
        if (originalImage) {
            runProcessing();
        }
    }, [originalImage, params, runProcessing]);

    // ─────────────────────────────────────────────────────────────────────────────
    // Render
    // ─────────────────────────────────────────────────────────────────────────────
    const getTopRightTitle = () => {
        switch (params.analysisMode) {
            case 'ifft': return 'Inverse FFT';
            case 'random': return 'Phase Randomized';
            case 'wave':
                return 'Wave Display' + (clickCoords ? ` (${clickCoords.u.toFixed(0)}, ${clickCoords.v.toFixed(0)})` : '');
            default: return '- Empty -';
        }
    };

    return (
        <div className="app-container">
            <main className="main-content">
                <div className="quadrant-container">
                    {/* Top Left: Preprocessed Source */}
                    <div className="quadrant top-left">
                        <h2>Preprocessed Source</h2>
                        <div className="quadrant-content">
                            {results.processed ? (
                                <CanvasDisplay
                                    data={results.processed.data}
                                    width={results.processed.width}
                                    height={results.processed.height}
                                    activeTool={activeTool}
                                    viewState={fftViewState}
                                    onZoom={handleFftZoom}
                                    onPan={handleFftPan}
                                    onReset={handleFftReset}
                                    isCtrlDown={isCtrlDown}
                                />
                            ) : (
                                !originalImage && <DragDropUploader onFileUpload={handleFileUpload} />
                            )}
                        </div>
                    </div>

                    {/* Top Right: Reconstruction */}
                    <div className="quadrant top-right" style={{ borderColor: params.analysisMode !== 'empty' ? '#646cff' : '#333' }}>
                        <h2>{getTopRightTitle()}</h2>
                        <div className="quadrant-content">
                            {results.reconstruction && (
                                <CanvasDisplay
                                    data={results.reconstruction.data}
                                    width={results.reconstruction.width}
                                    height={results.reconstruction.height}
                                    activeTool={activeTool}
                                    viewState={fftViewState}
                                    onZoom={handleFftZoom}
                                    onPan={handleFftPan}
                                    onReset={handleFftReset}
                                    isCtrlDown={isCtrlDown}
                                />
                            )}
                        </div>
                    </div>

                    {/* Bottom Left: FFT Amplitude */}
                    <div
                        className="quadrant bottom-left"
                        onMouseDown={(e) => results.magnitude && handleFFTMousedown(e, results.magnitude.width, results.magnitude.height)}
                        onMouseMove={(e) => results.magnitude && handleFFTMousemove(e, results.magnitude.width, results.magnitude.height)}
                    >
                        <h2>FFT Amplitude {params.analysisMode === 'wave' && '(Click me)'}</h2>
                        <div className="quadrant-content" style={{ cursor: params.analysisMode === 'wave' ? 'crosshair' : 'default' }}>
                            {results.magnitude && (
                                <CanvasDisplay
                                    data={results.magnitude.data}
                                    width={results.magnitude.width}
                                    height={results.magnitude.height}
                                    overlays={{ active: currentDonut, centeredDonut, spots: spotPoints }}
                                    activeTool={params.analysisMode === 'wave' ? null : activeTool}
                                    viewState={fftViewState}
                                    onZoom={handleFftZoom}
                                    onPan={handleFftPan}
                                    onReset={handleFftReset}
                                    isCtrlDown={isCtrlDown}
                                    onHover={handleHover}
                                />
                            )}
                        </div>
                    </div>

                    {/* Bottom Right: FFT Phase */}
                    <div
                        className="quadrant bottom-right"
                        onMouseDown={(e) => results.phase && handleFFTMousedown(e, results.phase.width, results.phase.height)}
                        onMouseMove={(e) => results.phase && handleFFTMousemove(e, results.phase.width, results.phase.height)}
                    >
                        <h2>FFT Phase {params.analysisMode === 'wave' && '(Click me)'}</h2>
                        <div className="quadrant-content" style={{ cursor: params.analysisMode === 'wave' ? 'crosshair' : 'default' }}>
                            {results.phase && (
                                <CanvasDisplay
                                    data={results.phase.data}
                                    width={results.phase.width}
                                    height={results.phase.height}
                                    overlays={{ active: currentDonut, centeredDonut, spots: spotPoints }}
                                    activeTool={params.analysisMode === 'wave' ? null : activeTool}
                                    viewState={fftViewState}
                                    onZoom={handleFftZoom}
                                    onPan={handleFftPan}
                                    onReset={handleFftReset}
                                    isCtrlDown={isCtrlDown}
                                    onHover={handleHover}
                                />
                            )}
                        </div>
                    </div>
                </div>

                <aside className="control-panel">
                    <ControlPanel
                        params={params}
                        setParams={setParams}
                        onFileSelect={handleFileUpload}
                        onProcess={runProcessing}
                        spotPoints={spotPoints}
                        setSpotPoints={setSpotPoints}
                        activeTool={activeTool}
                        setActiveTool={setActiveTool}
                        spotSize={spotSize}
                        setSpotSize={setSpotSize}
                        centeredDonut={centeredDonut}
                        setCenteredDonut={setCenteredDonut}
                        resetFilters={resetFilters}
                        results={results}
                    />
                    <div className="footer-section">
                        <div className="university-emblems">
                            <img src="university_logo.png" alt="University Emblems" className="emblem-image" />
                        </div>
                        <div className="copyright">
                            <p>© AG Kastritis</p>
                        </div>
                    </div>
                </aside>
            </main>
            {processing && <div className="loading-overlay">Processing...</div>}
            {hoverInfo && (
                <div
                    className="fft-tooltip"
                    style={{ left: hoverInfo.mouseX, top: hoverInfo.mouseY }}
                >
                    <div className="row">
                        <span className="label">Intensity:</span>
                        <span className="value">{hoverInfo.mag}</span>
                    </div>
                    <div className="row">
                        <span className="label">Phase:</span>
                        <span className="value">{hoverInfo.phase}</span>
                    </div>
                </div>
            )}
        </div>
    );
}

export default App;
