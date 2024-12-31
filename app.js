const { exec } = require("child_process");

const videoURL = "./video3.mp4";
const StreamKey = "9tgp-g1ta-a7mq-cy6a-00p0";

const loop = true;
const title = "demo title from server";
const desc = "demo description from server";

const command = `ffmpeg -re -stream_loop ${
  loop ? -1 : 0
} -i "${videoURL}" -metadata title="${title}" -metadata comment="${desc}" -f flv rtmp://a.rtmp.youtube.com/live2/${StreamKey}`;

const process = exec(command);

process.stdout.on("data", (data) => {
  console.log(data);
});
process.stderr.on("data", (data) => {
  console.error(data);
});
process.on("close", (code) => {
  console.log(`FFMPEG process exited with code ${code}`);
});
