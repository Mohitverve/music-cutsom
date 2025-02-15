import React, { useState, useRef, useEffect } from "react";
import axios from "axios";
import { Upload, Button, message, Select, Slider } from "antd";
import { UploadOutlined, AudioOutlined } from "@ant-design/icons";
import { ReactSortable } from "react-sortablejs";

// Wavesurfer core + plugin
import WaveSurfer from "wavesurfer.js";
import RegionsPlugin from "wavesurfer.js/dist/plugins/regions.js";

/**
 * WaveformTrimmer uses Wavesurfer to let users visually trim start/end.
 */
function WaveformTrimmer({ audioUrl, clip, onTrimChange }) {
  const waveformRef = useRef(null);
  const waveSurfer = useRef(null);

  useEffect(() => {
    if (!audioUrl) return;

    // Destroy any old instance
    if (waveSurfer.current) {
      waveSurfer.current.destroy();
      waveSurfer.current = null;
    }

    // Create new WaveSurfer instance
    waveSurfer.current = WaveSurfer.create({
      container: waveformRef.current,
      waveColor: "#999",
      progressColor: "#555",
      responsive: true,
      plugins: [
        RegionsPlugin.create({
          dragSelection: true,
        }),
      ],
    });

    waveSurfer.current.load(audioUrl);

    waveSurfer.current.on("ready", () => {
      const duration = waveSurfer.current.getDuration();
      // default region from trimStart->trimEnd
      const start = clip.trimStart || 0;
      const end =
        clip.trimEnd && clip.trimEnd < duration ? clip.trimEnd : duration;

      waveSurfer.current.addRegion({
        start,
        end,
        drag: true,
        resize: true,
        color: "rgba(255, 165, 0, 0.2)",
      });
    });

    waveSurfer.current.on("region-updated", (region) => {
      // region.start, region.end in seconds
      onTrimChange({
        trimStart: region.start,
        trimEnd: region.end,
      });
    });

    return () => {
      if (waveSurfer.current) {
        waveSurfer.current.destroy();
        waveSurfer.current = null;
      }
    };
  }, [audioUrl]);

  return <div ref={waveformRef} style={{ width: "100%", margin: "0 auto" }} />;
}

const { Option } = Select;

const AdvancedRemixMaker = () => {
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [orderedClips, setOrderedClips] = useState([]);
  const [remixUrl, setRemixUrl] = useState(null);
  const [remixing, setRemixing] = useState(false);

  const [recording, setRecording] = useState(false);
  const mediaRecorderRef = useRef(null);
  const recordedChunksRef = useRef([]);

  const [backgroundMusic, setBackgroundMusic] = useState(null);

  // Adjust this to your actual backend domain:
  const baseURL = "https://web-production-a2ce.up.railway.app";

  // ---------------------------------------
  // 1) Custom file upload
  // ---------------------------------------
  const customUpload = async ({ file, onSuccess, onError }) => {
    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await axios.post(`${baseURL}/upload`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      const fileUrl = response.data.url;
      const newClip = {
        name: file.name,
        url: fileUrl,
        trimStart: 0,
        trimEnd: 0, // will be set once waveSurfer loads
        speed: 1.0,
      };
      setUploadedFiles((prev) => [...prev, newClip]);
      setOrderedClips((prev) => [...prev, newClip]);

      onSuccess("ok");
    } catch (error) {
      console.error("Upload error:", error);
      message.error("Upload failed");
      onError(error);
    }
  };

  // ---------------------------------------
  // 2) Audio Recording
  // ---------------------------------------
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream);
      recordedChunksRef.current = [];

      mediaRecorderRef.current.ondataavailable = (e) => {
        if (e.data.size > 0) {
          recordedChunksRef.current.push(e.data);
        }
      };

      mediaRecorderRef.current.onstop = handleRecordingStop;
      mediaRecorderRef.current.start();
      setRecording(true);
      message.info("Recording started");
    } catch (error) {
      console.error("Recording error:", error);
      message.error("Could not start recording");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      setRecording(false);
      message.info("Recording stopped");
    }
  };

  const handleRecordingStop = async () => {
    const blob = new Blob(recordedChunksRef.current, { type: "audio/webm" });
    const file = new File([blob], "recording.webm", { type: "audio/webm" });

    customUpload({
      file,
      onSuccess: () => message.success("Recording uploaded"),
      onError: () => message.error("Failed to upload recording"),
    });
  };

  // ---------------------------------------
  // 3) Handle final remix
  // ---------------------------------------
  const handleRemix = async () => {
    if (orderedClips.length === 0) {
      message.error("Please add at least one audio clip.");
      return;
    }

    setRemixing(true);
    setRemixUrl(null);

    try {
      // Build payload
      const clipsPayload = orderedClips.map((clip) => {
        const safeTrimEnd = clip.trimEnd > 0 ? clip.trimEnd : 9999; // fallback
        return {
          url: clip.url,
          trimStart: clip.trimStart,
          trimEnd: safeTrimEnd,
          speed: clip.speed,
        };
      });

      const payload = { clips: clipsPayload };
      if (backgroundMusic) {
        payload.backgroundMusic = backgroundMusic;
      }

      const response = await axios.post(`${baseURL}/remix`, payload, {
        responseType: "blob",
      });

      const blob = new Blob([response.data], { type: "audio/mpeg" });
      const remixDownloadUrl = URL.createObjectURL(blob);
      setRemixUrl(remixDownloadUrl);
      message.success("Remix created successfully!");
    } catch (error) {
      console.error("Error creating remix:", error);
      message.error("Failed to create remix.");
    }

    setRemixing(false);
  };

  // ---------------------------------------
  // 4) Update clip properties (trim, speed)
  // ---------------------------------------
  const updateClip = (index, newData) => {
    setOrderedClips((prev) =>
      prev.map((clip, i) => {
        if (i === index) {
          return { ...clip, ...newData };
        }
        return clip;
      })
    );
  };

  // ---------------------------------------
  // 5) Background music
  // ---------------------------------------
  const backgroundOptions = [
    { label: "None", value: null },
    { label: "Romantic Piano", value: "/uploads/romantic_piano.mp3" },
    { label: "Soft Guitar", value: "/uploads/soft_guitar.mp3" },
  ];

  // Let user upload a custom background track
  const handleBgUpload = async (file) => {
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await axios.post(`${baseURL}/upload`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setBackgroundMusic(response.data.url);
      message.success("Background track uploaded!");
    } catch (error) {
      message.error("Failed to upload background track");
    }
  };

  // ---------------------------------------
  // Render
  // ---------------------------------------
  return (
    <div style={{ padding: 20 }}>
      <h1>Advanced Remix Maker</h1>
      <p>
        Record or upload audio clips, visually trim, adjust speed, and overlay optional background music.
      </p>

      {/* Upload & Recording */}
      <div style={{ marginBottom: 20 }}>
        <Upload
          customRequest={customUpload}
          multiple
          accept="audio/*"
          showUploadList={false}
        >
          <Button icon={<UploadOutlined />}>Upload Audio Files</Button>
        </Upload>

        <Button
          style={{ marginLeft: 10 }}
          icon={<AudioOutlined />}
          onClick={recording ? stopRecording : startRecording}
        >
          {recording ? "Stop Recording" : "Record Audio"}
        </Button>
      </div>

      {/* Background Music Selection */}
      <div style={{ marginBottom: 20 }}>
        <p><strong>Background Music (optional):</strong></p>
        <Select
          style={{ width: 250, marginRight: 10 }}
          onChange={(value) => setBackgroundMusic(value)}
          value={backgroundMusic}
          placeholder="Select Background Music"
        >
          {backgroundOptions.map((opt) => (
            <Option key={opt.value || "none"} value={opt.value}>
              {opt.label}
            </Option>
          ))}
        </Select>

        <Upload
          accept="audio/*"
          showUploadList={false}
          beforeUpload={(file) => {
            handleBgUpload(file);
            return false; // prevent auto-upload
          }}
        >
          <Button>Upload Custom BG</Button>
        </Upload>
      </div>

      {/* Drag-and-Drop Clips */}
      <div style={{ marginBottom: 20 }}>
        <h3>Audio Clips (drag to reorder):</h3>
        <ReactSortable
          list={orderedClips}
          setList={setOrderedClips}
          style={{ border: "1px dashed #ccc", padding: 10 }}
          options={{ animation: 150 }}
        >
          {orderedClips.map((clip, index) => (
            <div
              key={clip.url}
              style={{
                marginBottom: 15,
                padding: 10,
                border: "1px solid #ddd",
                background: "#fafafa",
                cursor: "move",
              }}
            >
              <div style={{ marginBottom: 5 }}>
                <strong>{clip.name}</strong>
              </div>

              {/* Waveform for Trimming */}
              <WaveformTrimmer
                audioUrl={clip.url}
                clip={clip}
                onTrimChange={(trimData) => updateClip(index, trimData)}
              />

              {/* Speed Control */}
              <div style={{ marginTop: 10 }}>
                <span>Speed: </span>
                <Slider
                  min={0.5}
                  max={2.0}
                  step={0.1}
                  value={clip.speed}
                  onChange={(val) => updateClip(index, { speed: val })}
                  style={{ width: 200, display: "inline-block" }}
                />
                <span style={{ marginLeft: 10 }}>{clip.speed.toFixed(1)}x</span>
              </div>
            </div>
          ))}
        </ReactSortable>
      </div>

      {/* Create Remix Button */}
      <div style={{ marginBottom: 20 }}>
        <Button type="primary" onClick={handleRemix} loading={remixing}>
          Create Remix
        </Button>
      </div>

      {/* Remix Preview & Download */}
      {remixUrl && (
        <div>
          <h3>Remix Preview:</h3>
          <audio controls src={remixUrl} style={{ width: "100%" }} />
          <div style={{ marginTop: 10 }}>
            <a href={remixUrl} download="couple_remix.mp3">
              Download Remix
            </a>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdvancedRemixMaker;
