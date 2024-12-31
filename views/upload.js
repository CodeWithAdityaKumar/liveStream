
console.log(process.env.apiKey);


var firebaseConfig = {
  apiKey: process.env.apiKey,
  authDomain: process.env.authDomain,
  projectId: process.env.projectId,
  storageBucket: process.env.storageBucket,
  messagingSenderId: process.env.messagingSenderId,
  appId: process.env.appId,
};
        // Initialize Firebase
        firebase.initializeApp(firebaseConfig);

        const uploadForm = document.getElementById('uploadForm');
        const videoTitle = document.getElementById('videoTitle');
        const videoFileInput = document.getElementById('videoFile');
        const thumbnailFileInput = document.getElementById('thumbnailFile');
        const videoPreview = document.getElementById('videoPreview');
        const progressBar = document.getElementById('progressBar');
        const videoSizeLabel = document.getElementById('videoSize');
        const uploadedSizeLabel = document.getElementById('uploadedSize');
        const uploadProgressLabel = document.getElementById('uploadProgress');
        const uploadButton = document.getElementById('uploadButton');
        const videoListContainer = document.getElementById('videoListContainer');
        const videoPreviewContainer = document.getElementById('videoPreviewContainer');

        videoFileInput.addEventListener('change', () => {
            const file = videoFileInput.files[0];
            if (file) {
                const url = URL.createObjectURL(file);
                videoPreview.src = url;
                videoPreview.style.display = 'block';
            } else {
                videoPreview.style.display = 'none';
            }
        });

        uploadForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const videoFile = videoFileInput.files[0];
            const thumbnailFile = thumbnailFileInput.files[0];
            if (!videoFile || !thumbnailFile) return;

            const videoStorageRef = firebase.storage().ref('videos/' + videoTitle.value + '_' + videoFile.name);
            const thumbnailStorageRef = firebase.storage().ref('thumbnails/' + videoTitle.value + '_' + thumbnailFile.name);

            const videoUploadTask = videoStorageRef.put(videoFile);
            const thumbnailUploadTask = thumbnailStorageRef.put(thumbnailFile);

            videoUploadTask.on('state_changed', (snapshot) => {
                const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                progressBar.style.width = progress + '%';
                uploadProgressLabel.textContent = progress.toFixed(2) + '%';

                const videoSizeMB = (snapshot.totalBytes / (1024 * 1024)).toFixed(2);
                videoSizeLabel.textContent = videoSizeMB;

                const uploadedSizeMB = (snapshot.bytesTransferred / (1024 * 1024)).toFixed(2);
                uploadedSizeLabel.textContent = uploadedSizeMB;
            }, (error) => {
                console.error('Upload failed:', error);
            }, () => {
                videoUploadTask.snapshot.ref.getDownloadURL().then((videoURL) => {
                    thumbnailUploadTask.snapshot.ref.getDownloadURL().then((thumbnailURL) => {
                        const videoData = {
                            title: videoTitle.value,
                            videoURL: videoURL,
                            thumbnailURL: thumbnailURL
                        };
                        firebase.database().ref('videos').push(videoData);
                        uploadButton.disabled = false;
                        addVideoToList(videoData);
                    });
                });
            });
        });

        function addVideoToList(videoData) {
            const li = document.createElement('li');
            li.className = 'flex items-center space-x-4';
            li.innerHTML = `
                <img src="${videoData.thumbnailURL}" class="w-24 h-24 rounded-lg" alt="Thumbnail">
                <div class="flex-1">
                    <h4 class="font-bold">${videoData.title}</h4>
                    <button class="bg-blue-500 text-white px-2 py-1 rounded-lg hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500" onclick="copyToClipboard('${videoData.videoURL}')">Copy Link</button>
                </div>
            `;
            videoListContainer.appendChild(li);
        }

        function copyToClipboard(text) {
            navigator.clipboard.writeText(text).then(() => {
                alert('Link copied to clipboard');
            }).catch((err) => {
                console.error('Could not copy text: ', err);
            });
        }

        function loadVideos() {
            firebase.database().ref('videos').on('value', (snapshot) => {
                videoListContainer.innerHTML = '';
                snapshot.forEach((childSnapshot) => {
                    const videoData = childSnapshot.val();
                    addVideoToList(videoData);
                });
            });
        }

        loadVideos();