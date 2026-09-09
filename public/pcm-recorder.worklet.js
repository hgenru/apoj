class PcmRecorderProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.recording = false;
    this.channelMode = "mix";
    this.blocks = [];
    this.length = 0;

    this.port.onmessage = (event) => {
      const message = event.data;
      if (message.type === "configure") {
        this.channelMode = message.channelMode;
      }
      if (message.type === "start") {
        this.blocks = [];
        this.length = 0;
        this.recording = true;
      }
      if (message.type === "stop") {
        this.recording = false;
        const joined = new Float32Array(this.length);
        let offset = 0;
        for (const block of this.blocks) {
          joined.set(block, offset);
          offset += block.length;
        }
        this.blocks = [];
        this.length = 0;
        this.port.postMessage({ type: "stopped", samples: joined }, [joined.buffer]);
      }
    };
  }

  process(inputs, outputs) {
    for (const output of outputs) {
      for (const channel of output) channel.fill(0);
    }

    if (!this.recording) return true;
    const channels = inputs[0];
    if (!channels || channels.length === 0) return true;

    const left = channels[0];
    const right = channels[1] || left;
    const block = new Float32Array(left.length);

    if (this.channelMode === "left") {
      block.set(left);
    } else if (this.channelMode === "right") {
      block.set(right);
    } else {
      for (let index = 0; index < block.length; index += 1) {
        block[index] = (left[index] + right[index]) * 0.5;
      }
    }

    this.blocks.push(block);
    this.length += block.length;
    return true;
  }
}

registerProcessor("pcm-recorder", PcmRecorderProcessor);
