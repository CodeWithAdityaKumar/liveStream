const express = require("express");
const { spawn } = require("child_process");
const path = require("path");
const bodyParser = require("body-parser");
require("dotenv").config();
const app = express();

app.use(bodyParser.json());

const PORT = process.env.PORT || 8000;

let FFMPEGProcess = null;

app.post("/api/stream/start", (req, res) => {
  const { videoURL, StreamKey, AppStreamKey } = req.body;

  console.log(videoURL, StreamKey, AppStreamKey);

  

  let loop = true;

  if (AppStreamKey == process.env.AppStreamKey) {
    const command = [
      "-re",
      "-stream_loop",
      loop ? -1 : 0,
      "-i",
      videoURL,
      "-f",
      "flv",
      `rtmp://a.rtmp.youtube.com/live2/${StreamKey}`,
    ];
    FFMPEGProcess = spawn("ffmpeg", command);

    FFMPEGProcess.stdout.on("data", (data) => {
      console.log(data);
    });
    FFMPEGProcess.stderr.on("data", (data) => {
      console.error(data);
    });
    FFMPEGProcess.on("close", (code) => {
      console.log(`FFMPEG process exited with code ${code}`);
    });

    res.send("Stream Started...");
  } else {
    res.status(400).send("Invalid Key");
  }
});

app.post("/api/stream/stop", (req, res) => {
  const { AppStreamKey } = req.body;

  if (FFMPEGProcess) {
    if (AppStreamKey == process.env.AppStreamKey) {
      process.kill("SIGTERM");
      process = null;
      res.send("Stream Stopped...");
    } else {
      res.status(400).send("Invalid Key");
    }
  } else {
    res.status(400).send("No stream is running.");
  }
});

app.get("/", (req, res) => {
  res.send("hiiiii");
});

app.get("/pages/upload", (req, res) => {
  res.sendFile(path.join("./pages/upload.html"));
});

app.get("/pages/stream", (req, res) => {
  res.sendFile(path.join("./pages/Home.html"));
});

app.listen(PORT, (err) => {
  console.log("Server Is running");
});
