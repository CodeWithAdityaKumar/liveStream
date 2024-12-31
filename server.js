const express = require('express');
const { exec, spawn } = require("child_process");

const app = express()

let process = null;

app.get("/api/stream/start",(req, res) => {
    

    // const videoURL = "./video3.mp4";
    const videoURL =
      "https://firebasestorage.googleapis.com/v0/b/akmovies4upro-8a87e.appspot.com/o/videos%2Fvideo3.mp4?alt=media&token=5538fc67-1f09-4b32-8633-b0d0c8494e25";
    const StreamKey = "9tgp-g1ta-a7mq-cy6a-00p0";

    const loop = true;
    const title = "demo title from server";
    const desc = "demo description from server";

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
    
    
    
    
    // const command = `ffmpeg -re -stream_loop ${
    //   loop ? -1 : 0
    // } -i "${videoURL}" -metadata title="${title}" -metadata comment="${desc}" -f flv rtmp://a.rtmp.youtube.com/live2/${StreamKey}`;

    // process = exec(command);
    process = spawn("ffmpeg",command);

    console.log(process.pid);
    // 13184;
    

    process.stdout.on("data", (data) => {
      console.log(data);
    });
    process.stderr.on("data", (data) => {
      console.error(data);
    });
    process.on("close", (code) => {
        console.log(`FFMPEG process exited with code ${code}`);
        
    });
    
    res.send("Stream Started...")

})

app.get("/api/stream/stop", (req, res) => {
    if (process) {
        process.kill("SIGTERM");
        process = null;

        // exec("pkill -f ffmpeg", (err) => {
        //     console.error("Error Stopping FFMPEG Processes", err);
        //     return res.status(400).send("Failed to stop ffmpeg processes")
        //     process = null;
            
        // })

        res.send("Stream Stopped...")
    } else {
        res.status(400).send("No stream is running.")
    }
})

app.get("/", (req, res) => {
    res.send("hoiiiii")
})

app.listen(3000, (err) => {
    console.log("Server Is running");
    
})