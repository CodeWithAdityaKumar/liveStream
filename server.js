import express from 'express';
import { spawn } from 'child_process';
import path from 'path';
import dotenv from 'dotenv';
dotenv.config();
const app = express()
const PORT = process.env.PORT || 8000;



app.use(express.json()); // For JSON payloads
app.use(express.urlencoded({ extended: true })); // For URL-encoded payloads


app.set("view engine", "ejs");
app.use(express.static("public"));


let FFMPEGProcess = null;

app.post("/api/stream/start", (req, res) => {
    
    let { videoURL, StreamKey, AppStreamKey, loop } = req.body;

    if (loop == "no") {
        loop = false;
    } else {
        loop = true
    }

    console.log(videoURL, StreamKey, AppStreamKey, loop);


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

        // res.send("Stream Started...");
        res.redirect(`/pages/stream`);
    } else {
        res.status(400).send("Invalid Key");
    }

})

app.post("/api/stream/stop", (req, res) => {
    const { AppStreamKey } = req.body;
    // const {key} = req.body

    if (FFMPEGProcess) {
      if (AppStreamKey == process.env.AppStreamKey) {
        FFMPEGProcess.kill("SIGTERM");
        FFMPEGProcess = null;
          // res.send("Stream Stopped...");
          res.redirect(`/pages/stream`);
      } else {
        res.status(400).send("Invalid Key");
      }
    } else {
      res.status(400).send("No stream is running.");
    }
})
app.get("/", (_, res) => {
    res.send("hiiiii")
})

app.get("/pages/upload", (_, res) => {
    res.render("Upload", {
      ApiKey: process.env.apiKey,
      AuthDomain: process.env.authDomain,
      DatabaseURL: process.env.databaseURL,
      ProjectId: process.env.projectId,
      StorageBucket: process.env.storageBucket,
      MessagingSenderId: process.env.messagingSenderId,
      AppId: process.env.appId,
    });
})

app.get("/pages/stream", (_, res) => {

    let isStreaming = false

    if (FFMPEGProcess) {
        isStreaming = true;
    } else {
        isStreaming = false
    }
        res.render("Home", {isStreaming});

})


app.listen(PORT, () => {
  console.log("Server Is running");
});