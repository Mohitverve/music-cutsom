import React, { useState, useRef } from "react";
import { Upload, Button, message, Select } from "antd";
import { UploadOutlined, AudioOutlined } from "@ant-design/icons";
import { ReactSortable } from "react-sortablejs";
import axios from "axios";
import "antd/dist/reset.css"; // For antd v4; use "antd/dist/reset.css" for v5

const { Option } = Select;

const CustomCoupleRemixMaker = () => {
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [orderedFiles, setOrderedFiles] = useState([]);
  const [remixUrl, setRemixUrl] = useState(null);
  const [remixing, setRemixing] = useState(false);
  const [recording, setRecording] = useState(false);
  const [backgroundMusic, setBackgroundMusic] = useState(null);
  const mediaRecorderRef = useRef(null);
  const recordedChunksRef = useRef([]);

  // Custom upload function to send a file to the Flask backend
  const customUpload = async ({ file, onSuccess, onError }) => {
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await axios.post("https://web-production-a2ce.up.railway.app//upload", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      const fileUrl = response.data.url;
      const fileObj = { name: file.name, url: fileUrl };
      setUploadedFiles((prev) => [...prev, fileObj]);
      setOrderedFiles((prev) => [...prev, fileObj]);
      onSuccess("ok");
    } catch (error) {
      console.error("Upload error:", error);
      message.error("Upload failed");
      onError(error);
    }
  };

  // Handle audio recording using the MediaRecorder API
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
    // Upload the recorded file using the same custom upload function
    customUpload({
      file,
      onSuccess: () => message.success("Recording uploaded"),
      onError: () => message.error("Failed to upload recording"),
    });
  };

  // Handler to create the remix by sending file URLs (and background music if selected) to the Flask backend
  const handleRemix = async () => {
    if (orderedFiles.length === 0) {
      message.error("Please upload or record at least one audio file.");
      return;
    }
    setRemixing(true);
    try {
      const urls = orderedFiles.map((file) => file.url);
      const payload = { urls };
      if (backgroundMusic) {
        payload.backgroundMusic = backgroundMusic;
      }
      const response = await axios.post(
        "https://web-production-a2ce.up.railway.app//remix",
        payload,
        { responseType: "blob" }
      );
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

  // Predefined background music options.
  // (Make sure these files exist on your backend under /uploads or use public URLs)
  const backgroundOptions = [
    { label: "None", value: null },
    { label: "Romantic Piano", value: "/uploads/romantic_piano.mp3" },
    { label: "Soft Guitar", value: "/uploads/soft_guitar.mp3" },
  ];

  return (
    <div style={{ padding: 20 }}>
      <h1>Couple Remix Maker</h1>
      <p>Record a love note or upload audio clips, then arrange them to create your personalized remix.</p>

      {/* Upload & Recording Controls */}
      <div style={{ marginBottom: 10 }}>
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

      {/* Background Music Selection */}
      <div style={{ marginBottom: 20 }}>
        <p>Select Background Music (optional):</p>
        <Select
          style={{ width: 200 }}
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
      </div>

      {/* Drag-and-Drop List of Files */}
      <div style={{ marginBottom: 20 }}>
        <h3>Uploaded & Recorded Files (drag to reorder):</h3>
        <ReactSortable
          list={orderedFiles}
          setList={setOrderedFiles}
          tag="div"
          style={{
            minHeight: "50px",
            border: "1px dashed #ccc",
            padding: "10px",
          }}
          options={{ animation: 150 }}
        >
          {orderedFiles.map((file) => (
            <div
              key={file.url}
              style={{
                padding: 10,
                border: "1px solid #ddd",
                marginBottom: 5,
                background: "#fafafa",
                cursor: "move",
              }}
            >
              {file.name}
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

export default CustomCoupleRemixMaker;
