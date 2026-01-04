import React, { useRef } from 'react';
import { exportFloat32AsPNG } from '../utils/exporter';

const ControlPanel = ({
    params, setParams, onProcess, onFileSelect,
    spotPoints, setSpotPoints,
    activeTool, setActiveTool,
    spotSize, setSpotSize,
    centeredDonut, setCenteredDonut, resetFilters,
    results
}) => {
    const hiddenInputRef = useRef(null);

    const handleChange = (key, value) => {
        setParams(prev => ({ ...prev, [key]: value }));
    };

    const handleFileChange = (e) => {
        const file = e.target.files[0];
        if (file && onFileSelect) {
            onFileSelect(file);
        }
        e.target.value = '';
    };

    const updateCenteredRadius = (key, val) => {
        setSpotPoints([]);
        setCenteredDonut(prev => ({ ...prev, [key]: parseFloat(val) || 0, enabled: true }));
    };

    const maxSpotSize = results?.magnitude
        ? Math.floor(Math.min(results.magnitude.width, results.magnitude.height) * 0.25)
        : 50;

    return (
        <div className="controls">
            {/* Header */}
            <div className="panel-title-container">
                <button className="mini-btn" onClick={() => hiddenInputRef.current?.click()} style={{ marginRight: '10px' }}>
                    New
                </button>
                <h3 className="panel-title" style={{ margin: 0 }}>FFT Processor</h3>
            </div>

            <input
                type="file"
                ref={hiddenInputRef}
                style={{ display: 'none' }}
                accept=".tif,.tiff,.jpg,.jpeg,.png,.mrc,.smv"
                onChange={handleFileChange}
            />

            {/* Image Adjustments */}
            <div className="control-group">
                <label><span>Gamma</span> <span>{params.gamma.toFixed(1)}</span></label>
                <input
                    type="range" min="0.1" max="3.0" step="0.1"
                    value={params.gamma}
                    onChange={(e) => handleChange('gamma', parseFloat(e.target.value))}
                />
            </div>

            <div className="control-group">
                <label><span>Contrast</span> <span>{params.contrast.toFixed(1)}</span></label>
                <input
                    type="range" min="0.0" max="2.0" step="0.1"
                    value={params.contrast}
                    onChange={(e) => handleChange('contrast', parseFloat(e.target.value))}
                />
            </div>

            <div className="control-group">
                <label><span>Brightness</span> <span>{params.brightness.toFixed(2)}</span></label>
                <input
                    type="range" min="-1.0" max="1.0" step="0.05"
                    value={params.brightness}
                    onChange={(e) => handleChange('brightness', parseFloat(e.target.value))}
                />
            </div>

            <div className="control-group">
                <label className="group-label">RGB Mix</label>
                <div className="rgb-row">
                    <label style={{ color: '#ff5555' }}>R</label>
                    <input type="range" min="0" max="1" step="0.01" value={params.mixR} onChange={e => handleChange('mixR', parseFloat(e.target.value))} />
                </div>
                <div className="rgb-row">
                    <label style={{ color: '#55ff55' }}>G</label>
                    <input type="range" min="0" max="1" step="0.01" value={params.mixG} onChange={e => handleChange('mixG', parseFloat(e.target.value))} />
                </div>
                <div className="rgb-row">
                    <label style={{ color: '#5555ff' }}>B</label>
                    <input type="range" min="0" max="1" step="0.01" value={params.mixB} onChange={e => handleChange('mixB', parseFloat(e.target.value))} />
                </div>
            </div>

            <div className="control-group">
                <label className="group-label">Scale</label>
                <select value={params.scale} onChange={e => handleChange('scale', parseFloat(e.target.value))}>
                    <option value="1">1x (Original)</option>
                    <option value="0.5">0.5x</option>
                    <option value="0.25">0.25x</option>
                </select>
            </div>


            <hr className="divider" />
            <h3 className="panel-title-small">Analysis & Reconstruction</h3>

            <div className="control-group">
                <label className="group-label">Top-Right View</label>
                <select value={params.analysisMode || 'empty'} onChange={e => handleChange('analysisMode', e.target.value)}>
                    <option value="empty">- Empty -</option>
                    <option value="ifft">Inverse FFT</option>
                    <option value="random">Phase Randomized</option>
                    <option value="wave">Wave Display</option>
                </select>
            </div>

            {/* Toolbox (only in IFFT mode) */}
            {params.analysisMode === 'ifft' && (
                <>
                    <div className="control-group">
                        <label className="group-label">Toolbox</label>
                        <div className="toolbox">
                            <button
                                className={`tool-btn ${activeTool === 'donut' ? 'active' : ''}`}
                                onClick={() => setActiveTool('donut')}
                                title="Centered Donut Tool"
                            >
                                ⭘
                            </button>
                            <button
                                className={`tool-btn ${activeTool === 'spot' ? 'active' : ''}`}
                                onClick={() => setActiveTool('spot')}
                                title="Spot Filter"
                            >
                                <span style={{
                                    display: 'inline-block',
                                    width: '12px',
                                    height: '12px',
                                    backgroundColor: 'red',
                                    borderRadius: '50%'
                                }}></span>
                            </button>
                        </div>
                    </div>

                    {activeTool === 'donut' && (
                        <div className="control-group tool-settings">
                            <label className="group-label">Centered Donut</label>
                            <div className="input-row">
                                <div className="input-item">
                                    <label>Rmin</label>
                                    <input
                                        type="number" step="0.5" min="0"
                                        value={centeredDonut.rmin}
                                        onChange={(e) => updateCenteredRadius('rmin', e.target.value)}
                                    />
                                </div>
                                <div className="input-item">
                                    <label>Rmax</label>
                                    <input
                                        type="number" step="0.5" min="0"
                                        value={centeredDonut.rmax}
                                        onChange={(e) => updateCenteredRadius('rmax', e.target.value)}
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTool === 'spot' && (
                        <div className="control-group tool-settings">
                            <label><span>Spot Size</span> <span>{spotSize}px</span></label>
                            <input
                                type="range" min="0" max={maxSpotSize} step="1"
                                value={spotSize}
                                onChange={(e) => setSpotSize(parseInt(e.target.value))}
                            />
                        </div>
                    )}

                    <button className="mini-btn" onClick={resetFilters} style={{ width: '100%', marginTop: '10px', background: '#444' }}>
                        Reset All Filters
                    </button>
                </>
            )}

            <hr className="divider" />
            <h3 className="panel-title-small">Export</h3>
            <div className="control-group export-buttons">
                <button
                    className="mini-btn secondary"
                    disabled={!results?.processed}
                    onClick={() => results.processed && exportFloat32AsPNG(results.processed.data, results.processed.width, results.processed.height, 'source.png')}
                >
                    Source
                </button>
                <button
                    className="mini-btn secondary"
                    disabled={!results?.magnitude}
                    onClick={() => results.magnitude && exportFloat32AsPNG(results.magnitude.data, results.magnitude.width, results.magnitude.height, 'magnitude.png')}
                >
                    Mag
                </button>
                <button
                    className="mini-btn secondary"
                    disabled={!results?.phase}
                    onClick={() => results.phase && exportFloat32AsPNG(results.phase.data, results.phase.width, results.phase.height, 'phase.png')}
                >
                    Phase
                </button>
                <button
                    className="mini-btn secondary"
                    disabled={!results?.reconstruction}
                    onClick={() => results.reconstruction && exportFloat32AsPNG(results.reconstruction.data, results.reconstruction.width, results.reconstruction.height, 'reconstruction.png')}
                >
                    Rec
                </button>
            </div>

            <button className="update-btn" onClick={() => onProcess(true)} style={{ marginTop: '20px' }}>
                Update View
            </button>
        </div>
    );
};

export default ControlPanel;
