/**
 * Computes 2D FFT of a Float32Array image.
 * Assumes square input of power-of-two size for this simple implementation.
 * Returns { magnitude, phase } as Float32Arrays.
 */

export function computeFFT2D(data, width, height) {
    if (width !== height) {
        console.warn("FFT expects square input");
    }

    // Checking power of two
    if ((width & (width - 1)) !== 0) {
        throw new Error("FFT dimensions must be power of 2");
    }

    const size = width * height;

    // Complex number storage: Real and Imag parts
    const real = new Float32Array(data); // Copy input
    const imag = new Float32Array(size); // Zeros

    // 1D FFT on Rows
    fft1D_Rows(real, imag, width, height);

    // 1D FFT on Cols
    fft1D_Cols(real, imag, width, height);

    // Shift Zero Frequency to Center (fftshift)
    // And compute Magnitude/Phase
    const magnitude = new Float32Array(size);
    const phase = new Float32Array(size);
    const shiftedReal = new Float32Array(size);
    const shiftedImag = new Float32Array(size);

    const half = width / 2;

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            // Target coordinates for fftshift
            const cy = (y + half) % height;
            const cx = (x + half) % width;

            const idx = y * width + x;
            const cIdx = cy * width + cx;

            const r = real[idx];
            const i = imag[idx];

            // Log Magnitude: log(1 + sqrt(r^2 + i^2))
            const mag = Math.sqrt(r * r + i * i);
            magnitude[cIdx] = Math.log(1 + mag);

            // Phase: atan2
            phase[cIdx] = Math.atan2(i, r);

            shiftedReal[cIdx] = r;
            shiftedImag[cIdx] = i;
        }
    }

    return {
        magnitude,
        phase,
        real: shiftedReal,
        imag: shiftedImag
    };
}

// In-place 1D FFT on rows
export function fft1D_Rows(real, imag, width, height) {
    for (let y = 0; y < height; y++) {
        const offset = y * width;
        fft1D(real, imag, offset, width, 1);
    }
}

// In-place 1D FFT on cols
export function fft1D_Cols(real, imag, width, height) {
    for (let x = 0; x < width; x++) {
        const offset = x;
        fft1D(real, imag, offset, height, width);
    }
}

// Basic Cooley-Tukey Radix-2
function fft1D(real, imag, offset, n, stride) {
    // Bit reversal permutation
    let j = 0;
    for (let i = 0; i < n - 1; i++) {
        if (i < j) {
            // Swap
            const rTemp = real[offset + i * stride];
            const iTemp = imag[offset + i * stride];
            real[offset + i * stride] = real[offset + j * stride];
            imag[offset + i * stride] = imag[offset + j * stride];
            real[offset + j * stride] = rTemp;
            imag[offset + j * stride] = iTemp;
        }
        let k = n >> 1;
        while (k <= j) {
            j -= k;
            k >>= 1;
        }
        j += k;
    }

    // Butterfly
    let l = 1; // stage length
    while (l < n) {
        const theta = -Math.PI / l;
        const w_real = Math.cos(theta);
        const w_imag = Math.sin(theta);

        // Block loop
        for (let i = 0; i < n; i += 2 * l) {
            let wr = 1.0;
            let wi = 0.0;

            for (let m = 0; m < l; m++) {
                const idxA = offset + (i + m) * stride;
                const idxB = offset + (i + m + l) * stride; // Butterfly counterpart

                const tr = wr * real[idxB] - wi * imag[idxB];
                const ti = wr * imag[idxB] + wi * real[idxB];

                real[idxB] = real[idxA] - tr;
                imag[idxB] = imag[idxA] - ti;
                real[idxA] = real[idxA] + tr;
                imag[idxA] = imag[idxA] + ti;

                // Update W
                const wr_next = wr * w_real - wi * w_imag;
                wi = wr * w_imag + wi * w_real;
                wr = wr_next;
            }
        }
        l <<= 1;
    }
}


/**
 * Computes Inverse 2D FFT.
 * Input: Real and Imag arrays (Float32Array) of size width*height.
 * Returns: Float32Array (Real part of spatial domain).
 */
export function computeInverseFFT2D(real, imag, width, height) {
    const size = width * height;

    // We assume input is already in standard bit-reversed/freq order (DC at 0,0).

    // iFFT is (1/N) * Conjugate(FFT(Conjugate(X)))

    const r = new Float32Array(real);
    const i = new Float32Array(size);

    // Conjugate Input: Imag = -Imag
    for (let k = 0; k < size; k++) {
        i[k] = -imag[k];
    }

    // 1D FFT on Rows
    fft1D_Rows(r, i, width, height);
    // 1D FFT on Cols
    fft1D_Cols(r, i, width, height);

    // Conjugate Output and Scale
    const output = new Float32Array(size);
    const scale = 1.0 / size;

    for (let k = 0; k < size; k++) {
        // We only care about Real part for image
        output[k] = r[k] * scale;
    }

    return output;
}

/**
 * Helper to shift zero-frequency component from center to corners (ifftshift).
 * Inverse of fftshift.
 */
export function fftShift(data, width, height, reverse = false) {
    const output = new Float32Array(data.length);
    const halfW = width / 2;
    const halfH = height / 2;

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            let ty, tx;
            // For even dimensions, it's the same operation logic.
            ty = (y + halfH) % height;
            tx = (x + halfW) % width;

            const srcIdx = y * width + x;
            const dstIdx = ty * width + tx;
            output[dstIdx] = data[srcIdx];
        }
    }
    return output;
}

