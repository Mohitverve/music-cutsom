import React, { useState, useRef, useEffect } from "react";
import axios from "axios";
import { Upload, Button, message, Select, Slider } from "antd";
import { UploadOutlined, AudioOutlined } from "@ant-design/icons";
import { ReactSortable } from "react-sortablejs";

// Wavesurfer
import WaveSurfer from "wavesurfer.js";
import RegionsPlugin from "wavesurfer.js/src/plugin/regions.js";

/**
 * Waveform component for trimming.
 * Accepts an audioUrl, initial trimStart/trimEnd, and a callback onRegionChange.
 */
function WaveformTrimmer({ audioUrl, clip, onTrimChange }) {
  const waveformRef = useRef(null);
  const waveSurfer = useRef(null);

  useEffect(() => {
    if (!audioUrl) return;

    // Cleanup old wavesurfer instance if re-render
    if (waveSurfer.current) {
      waveSurfer.current.destroy();
      waveSurfer.current = null;
    }

    // Create a new wavesurfer instance
    waveSurfer.current = WaveSurfer.create({
      container: waveformRef.current,
      waveColor: "#999",
      progressColor: "#555",
      responsive: true,
      plugins: [
        RegionsPlugin.create({})
      ]
    });

    // Load the audio file
    waveSurfer.current.load(audioUrl);

    // Once ready, add a region from clip.trimStart to clip.trimEnd
    waveSurfer.current.on("ready", () => {
      const duration = waveSurfer.current.getDuration();

      const start = clip.trimStart >= 0 ? clip.trimStart : 0;
      const end = (clip.trimEnd && clip.trimEnd <= duration) ? clip.trimEnd : duration;

      waveSurfer.current.addRegion({
        start,
        end,
        drag: true,
        resize: true,
        color: "rgba(255, 165, 0, 0.2)"
      });
    });

    // Listen for region updates
    waveSurfer.current.on("region-updated", (region) => {
      // region.start, region.end in seconds
      onTrimChange({
        trimStart: region.start,
        trimEnd: region.end
      });
    });

    return () => {
      if (waveSurfer.current) {
        waveSurfer.current.destroy();
        waveSurfer.current = null;
      }
    };
  }, [audioUrl]);

  return (
    <div>
      <div ref={waveformRef} style={{ width: "100%", margin: "0 auto" }} />
    </div>
  );
}

const { Option } = Select;

const AdvancedRemixMaker = () => {
  const [uploadedFiles, setUploadedFiles] = useState([]); // All files
  const [orderedClips, setOrderedClips] = useState([]);   // For drag-n-drop
  const [remixUrl, setRemixUrl] = useState(null);
  const [remixing, setRemixing] = useState(false);

  const [recording, setRecording] = useState(false);
  const mediaRecorderRef = useRef(null);
  const recordedChunksRef = useRef([]);

  const [backgroundMusic, setBackgroundMusic] = useState(null);

  // ----- 1) Custom upload to Flask -----
  const customUpload = async ({ file, onSuccess, onError }) => {
    try {
      const formData = new FormData();
      formData.append("file", file);
      // Make sure you don't have double slashes in your base URL!
      // For demonstration, assume your base:
      const baseURL = "https://web-production-a2ce.up.railway.app"; 
      const response = await axios.post(`${baseURL}/upload`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      const fileUrl = response.data.url;
      // For new clips, default trimStart=0, trimEnd=some big number, speed=1.0
      const newClip = {
        name: file.name,
        url: fileUrl,
        trimStart: 0,
        trimEnd: 0, // We'll fix this once waveSurfer loads
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

  // ----- 2) MediaRecorder for voice recording -----
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream);
      recordedChunksRef.current = [];

      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          recordedChunksRef.current.push(event.data);
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
    // Reuse the custom upload logic
    customUpload({
      file,
      onSuccess: () => message.success("Recording uploaded"),
      onError: () => message.error("Failed to upload recording"),
    });
  };

  // ----- 3) Handle the final Remix creation -----
  const handleRemix = async () => {
    if (orderedClips.length === 0) {
      message.error("Please add at least one audio clip.");
      return;
    }

    setRemixing(true);
    setRemixUrl(null);

    try {
      // The server expects "clips": array of { url, trimStart, trimEnd, speed }
      // Ensure trimEnd is at least > 0 if waveSurfer hasn't updated it
      const clipsPayload = orderedClips.map((clip) => {
        const safeTrimEnd = clip.trimEnd > 0 ? clip.trimEnd : 99999; // big number
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

      const baseURL = "https://web-production-a2ce.up.railway.app";
      const response = await axios.post(`${baseURL}/remix`, payload, {
        responseType: "blob", // we expect an mp3 file
      });

      // Create a blob URL for preview
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

  // ----- 4) Handle user trimming/speed changes for each clip -----
  const updateClip = (clipIndex, newData) => {
    // newData could be { trimStart, trimEnd } or { speed }
    setOrderedClips((prev) =>
      prev.map((clip, i) => {
        if (i === clipIndex) {
          return { ...clip, ...newData };
        }
        return clip;
      })
    );
  };

  // ----- 5) Predefined background music, or user upload -----
  // Here are some placeholders if you have them:
  const backgroundOptions = [
    { label: "None", value: null },
    { label: "Romantic Piano", value: "/uploads/romantic_piano.mp3" },
    { label: "Soft Guitar", value: "/uploads/soft_guitar.mp3" },
  ];

  // For user-uploaded background track, we can add a separate Upload or reuse
  // the same approach. Example:
  const handleBgUpload = async (file) => {
    try {
      const formData = new FormData();
      formData.append("file", file);
      const baseURL = "https://web-production-a2ce.up.railway.app";
      const response = await axios.post(`${baseURL}/upload`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setBackgroundMusic(response.data.url);
      message.success("Background track uploaded!");
    } catch (error) {
      message.error("Failed to upload background track");
    }
  };

  return (
    <div style={{ padding: 20 }}>
      <h1>Advanced Remix Maker</h1>
      <p>
        Record or upload audio clips, trim them, change speed, and overlay optional background music.
      </p>

      {/* ========== Upload & Recording ========== */}
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
          type="default"
          icon={<AudioOutlined />}
          onClick={recording ? stopRecording : startRecording}
          style={{ marginLeft: 10 }}
        >
          {recording ? "Stop Recording" : "Start Recording"}
        </Button>
      </div>

      {/* ========== Background Music Options ========== */}
      <div style={{ marginBottom: 20 }}>
        <p><strong>Select or Upload Background Music (optional):</strong></p>
        <Select
          style={{ width: 250, marginRight: 10 }}
          placeholder="Select Background Music"
          onChange={(value) => setBackgroundMusic(value)}
          value={backgroundMusic}
        >
          {backgroundOptions.map((opt) => (
            <Option key={opt.value || "none"} value={opt.value}>
              {opt.label}
            </Option>
          ))}
        </Select>
        {/* Optional: upload your own BG track */}
        <Upload
          accept="audio/*"
          showUploadList={false}
          beforeUpload={(file) => {
            handleBgUpload(file);
            return false; // so it doesn't auto-upload
          }}
        >
          <Button>Upload Custom BG</Button>
        </Upload>
      </div>

      {/* ========== Drag-and-Drop List of Clips ========== */}
      <div style={{ marginBottom: 20 }}>
        <h3>Audio Clips (drag to reorder):</h3>
        <ReactSortable
          list={orderedClips}
          setList={setOrderedClips}
          tag="div"
          style={{ minHeight: "20px", border: "1px dashed #ccc", padding: "10px" }}
          options={{ animation: 150 }}
        >
          {orderedClips.map((clip, index) => (
            <div
              key={clip.url}
              style={{
                padding: 10,
                border: "1px solid #ddd",
                marginBottom: 10,
                background: "#fafafa",
                cursor: "move",
              }}
            >
              <div style={{ marginBottom: 5 }}>
                <strong>{clip.name}</strong>
              </div>
              {/* Waveform for trimming */}
              <WaveformTrimmer
                audioUrl={clip.url}
                clip={clip}
                onTrimChange={(trimData) => updateClip(index, trimData)}
              />
              {/* Speed control */}
              <div style={{ marginTop: 10 }}>
                <span>Speed: </span>
                <Slider
                  min={0.5}
                  max={2.0}
                  step={0.1}
                  value={clip.speed}
                  onChange={(val) => updateClip(index, { speed: val })}
                  tooltip={{ open: false }}
                  style={{ width: 200, display: "inline-block", marginRight: 10 }}
                />
                <span style={{ marginLeft: 10 }}>{clip.speed.toFixed(1)}x</span>
              </div>
            </div>
          ))}
        </ReactSortable>
      </div>

      {/* ========== Create Remix Button ========== */}
      <div style={{ marginBottom: 20 }}>
        <Button type="primary" onClick={handleRemix} loading={remixing}>
          Create Remix
        </Button>
      </div>

      {/* ========== Remix Preview & Download ========== */}
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
