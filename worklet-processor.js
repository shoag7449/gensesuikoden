class PCMProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        this.audioReadPosition = 0;
        this.audioWritePosition = 0;
        this.bufferSize = 64000;
        this.audioBufferResampled = new Int16Array(this.bufferSize);
        this.port.onmessage = (event) => {
            if (event.data.type === 'update-buffer') {
                this.audioBufferResampled.set(event.data.buffer);
                this.audioWritePosition = event.data.writePosition;
            }
        };
    }

    process(inputs, outputs) {
        const output = outputs[0];
        const outputData1 = output[0];
        const outputData2 = output[1];
        const buffsize = outputData1.length;

        for (let sample = 0; sample < buffsize; sample++) {
            if (this.audioWritePosition !== this.audioReadPosition) {
                outputData1[sample] = this.audioBufferResampled[this.audioReadPosition] / 32768;
                outputData2[sample] = this.audioBufferResampled[this.audioReadPosition + 1] / 32768;
                this.audioReadPosition += 2;
                if (this.audioReadPosition === this.bufferSize) {
                    this.audioReadPosition = 0;
                }
            } else {
                outputData1[sample] = 0;
                outputData2[sample] = 0;
            }
        }

        return true;
    }
}

registerProcessor('pcm-processor', PCMProcessor);