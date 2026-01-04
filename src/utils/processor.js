import { computeFFT2D, computeInverseFFT2D, fftShift } from './fft';

/**
 * Main image processing pipeline.
 * Handles channel mixing, cropping to square, scaling, adjustments, and FFT.
 */
export async function processImagePipeline(original, params) {
    if (!original || !original.channels) return null;

    const { processed, side } = preprocessImageOps(original, params);

    if (params.skipFFT) {
        return {
            processed: { data: processed, width: side, height: side },
            magnitude: null,
            phase: null
        };
    }

    const res = computeFFT2D(processed, side, side);
    const magnitude = res.magnitude;
    const phase = res.phase;

    const dispMag = normalize(magnitude);
    const dispPhase = normalize(phase, -Math.PI, Math.PI);

    return {
        processed: { data: processed, width: side, height: side },
        magnitude: { data: dispMag, width: side, height: side },
        phase: { data: dispPhase, width: side, height: side },
        rawMagnitude: magnitude,
        rawPhase: phase
    };
}

/**
 * Normalizes data to 0..1 range.
 */
function normalize(data, minVal, maxVal) {
    const res = new Float32Array(data.length);
    let min = minVal;
    let max = maxVal;

    if (min === undefined || max === undefined) {
        min = Infinity;
        max = -Infinity;
        for (let i = 0; i < data.length; i++) {
            if (data[i] < min) min = data[i];
            if (data[i] > max) max = data[i];
        }
    }

    const range = max - min;
    const invRange = range > 0 ? 1.0 / range : 0;

    for (let i = 0; i < data.length; i++) {
        res[i] = (data[i] - min) * invRange;
    }
    return res;
}

/**
 * Reconstructs an image from magnitude and phase.
 */
export async function reconstructImage(magnitude, phase, width, height, mode = 'normal', options = {}) {
    const size = width * height;
    const { spotPoints, centeredDonut } = options;

    const mask = generateMask(width, height, spotPoints, centeredDonut);

    const real = new Float32Array(size);
    const imag = new Float32Array(size);

    for (let i = 0; i < size; i++) {
        let mag = (Math.exp(magnitude[i]) - 1) * mask[i];
        if (mag < 0) mag = 0;

        let ph = phase[i];
        if (mode === 'random') {
            ph = (Math.random() * 2 * Math.PI) - Math.PI;
        }

        real[i] = mag * Math.cos(ph);
        imag[i] = mag * Math.sin(ph);
    }

    const unshiftedReal = fftShift(real, width, height, true);
    const unshiftedImag = fftShift(imag, width, height, true);

    const reconstructed = computeInverseFFT2D(unshiftedReal, unshiftedImag, width, height);
    return normalize(reconstructed);
}

/**
 * Generates a frequency mask based on centered donut and spot filters.
 */
function generateMask(width, height, spotPoints, centeredDonut) {
    const size = width * height;
    const mask = new Float32Array(size);

    const hasDonuts = (centeredDonut && centeredDonut.enabled);
    const hasSpots = spotPoints && spotPoints.length > 0;

    if (!hasDonuts && !hasSpots) {
        mask.fill(1.0);
        return mask;
    }

    if (hasDonuts) {
        const cx0 = width / 2;
        const cy0 = height / 2;
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const idx = y * width + x;

                if (centeredDonut && centeredDonut.enabled) {
                    const d = Math.sqrt((x - cx0) ** 2 + (y - cy0) ** 2);
                    if (d >= centeredDonut.rmin && d <= centeredDonut.rmax) {
                        mask[idx] = 1.0;
                    }
                }
            }
        }
    }

    if (hasSpots) {
        for (const p of spotPoints) {
            const r = p.size || 5;
            const rSq = r * r;
            const x0 = Math.max(0, Math.floor(p.x - r));
            const x1 = Math.min(width - 1, Math.ceil(p.x + r));
            const y0 = Math.max(0, Math.floor(p.y - r));
            const y1 = Math.min(height - 1, Math.ceil(p.y + r));

            for (let y = y0; y <= y1; y++) {
                for (let x = x0; x <= x1; x++) {
                    const distSq = (x - p.x) ** 2 + (y - p.y) ** 2;
                    if (distSq <= rSq) {
                        mask[y * width + x] = 1.0;
                    }
                }
            }
        }
    }

    return mask;
}

/**
 * Image preprocessing: channel mixing, cropping, scaling, and adjustments.
 */
export function preprocessImageOps(image, params) {
    const { width: w0, height: h0, channels } = image;
    const size0 = w0 * h0;

    // 1. Mix Channels
    let mixed = new Float32Array(size0);
    const { mixR, mixG, mixB } = params;
    if (channels.length >= 3) {
        for (let i = 0; i < size0; i++) {
            mixed[i] = channels[0][i] * mixR + channels[1][i] * mixG + channels[2][i] * mixB;
        }
    } else {
        mixed = channels[0];
    }

    // 2. Crop to Square
    const side = Math.min(w0, h0);
    const offsetX = Math.floor((w0 - side) / 2);
    const offsetY = Math.floor((h0 - side) / 2);
    let cropped = new Float32Array(side * side);
    for (let y = 0; y < side; y++) {
        for (let x = 0; x < side; x++) {
            cropped[y * side + x] = mixed[(offsetY + y) * w0 + (offsetX + x)];
        }
    }

    // 3. Scale
    let scaled = cropped;
    let sSide = side;
    if (params.scale !== 1) {
        sSide = Math.floor(side * params.scale);
        const temp = new Float32Array(sSide * sSide);
        for (let y = 0; y < sSide; y++) {
            for (let x = 0; x < sSide; x++) {
                const sy = Math.floor(y / params.scale);
                const sx = Math.floor(x / params.scale);
                if (sy < side && sx < side) {
                    temp[y * sSide + x] = cropped[sy * side + sx];
                }
            }
        }
        scaled = temp;
    }

    // 4. Force Power of 2 (required for Radix-2 FFT)
    let potSide = 1;
    while (potSide * 2 <= sSide) potSide *= 2;
    if (potSide !== sSide) {
        const temp = new Float32Array(potSide * potSide);
        const off = Math.floor((sSide - potSide) / 2);
        for (let y = 0; y < potSide; y++) {
            for (let x = 0; x < potSide; x++) {
                temp[y * potSide + x] = scaled[(y + off) * sSide + (x + off)];
            }
        }
        scaled = temp;
        sSide = potSide;
    }

    // 5. Adjustments (Brightness, Contrast, Gamma)
    const processed = new Float32Array(sSide * sSide);
    const { brightness, contrast, gamma } = params;
    for (let i = 0; i < sSide * sSide; i++) {
        let val = scaled[i];
        val = (val - 0.5) * contrast + 0.5 + brightness;
        if (val < 0) val = 0;
        if (gamma !== 1.0) val = Math.pow(val, 1.0 / gamma);
        if (val > 1) val = 1;
        processed[i] = val;
    }

    return { processed, side: sSide };
}
