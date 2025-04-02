useEffect(() => {
  let feedbackInterval;
  const recordingStart = Date.now();

  if (recording) {
    feedbackInterval = setInterval(() => {
      if (!videoRef.current || !canvasRef.current) return;
      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const imageData = canvas.toDataURL('image/jpeg');

      fetch('https://squat-analyzer-backend.onrender.com/analyze-squat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: imageData })
      })
      .then(response => response.json())
      .then(data => {
        const timestamp = (Date.now() - recordingStart) / 1000; // accurate seconds
        setFeedbackLog(prev => [...prev, { timestamp, feedback: data }]);
        console.log("Feedback logged at", timestamp, ":", data);
      })
      .catch(err => console.error("Error:", err));
    }, 500);
  }

  return () => clearInterval(feedbackInterval);
}, [recording]);
