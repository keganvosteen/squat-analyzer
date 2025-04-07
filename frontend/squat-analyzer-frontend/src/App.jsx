// src/App.jsx
import React, { useState } from 'react';
import VideoCapture from './components/VideoCapture';
import ExercisePlayback from './components/ExercisePlayback';
import './App.css';

function App() {
  const [recordings, setRecordings] = useState([]);
  const [currentFeedback, setCurrentFeedback] = useState(null);
  const [activeRecordingIndex, setActiveRecordingIndex] = useState(null);
  const [isRecordingMode, setIsRecordingMode] = useState(true);

  // Real-time feedback during recording
  const handleFrameCapture = (data) => {
    setCurrentFeedback(data);
  };

  // Save recording when completed
  const handleRecordingComplete = (data) => {
    console.log("Recording complete with data:", data);
    console.log("Video URL received:", data.videoUrl);
    console.log("Feedback data points:", data.feedbackData?.length || 0);
    console.log("Squat timings:", data.squatTimings?.length || 0);
    
    // Validate the data before storing
    if (!data.videoUrl) {
      console.error("No video URL provided!");
      return;
    }
    
    // Only store one recording at a time
    setRecordings([data]);
    setActiveRecordingIndex(0); // Always set to first (and only) recording
    setIsRecordingMode(false); // Switch to playback mode
    
    // Create an anchor element to verify URL is valid
    try {
      const testUrl = new URL(data.videoUrl);
      console.log("Valid URL created:", testUrl.href);
    } catch (err) {
      console.error("Invalid video URL:", err);
    }
  };

  // Switch to recording mode
  const handleStartNewRecording = () => {
    setIsRecordingMode(true);
    setCurrentFeedback(null);
  };

  // Select a recording to playback
  const handleSelectRecording = (index) => {
    setActiveRecordingIndex(index);
    setIsRecordingMode(false);
  };

  // Delete a recording
  const handleDeleteRecording = (index) => {
    setRecordings(prev => prev.filter((_, i) => i !== index));
    if (activeRecordingIndex === index) {
      setActiveRecordingIndex(null);
      setIsRecordingMode(true);
    } else if (activeRecordingIndex > index) {
      setActiveRecordingIndex(prev => prev - 1);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 text-gray-900 w-full flex flex-col">
      <header className="bg-blue-600 text-white p-4 shadow-md">
        <div className="container mx-auto">
          <h1 className="text-2xl font-bold">Squat Analyzer</h1>
          <p className="text-sm opacity-80">Record, analyze and improve your squat form</p>
        </div>
      </header>
      
      <main className="container mx-auto p-4 flex-1 flex flex-col">
        {/* Mode Toggle */}
        <div className="flex justify-between mb-4">
          <h2 className="text-xl font-semibold">
            {isRecordingMode ? 'Record Your Squat' : 'Analyze Your Form'}
          </h2>
          
          <div className="flex gap-2">
            {!isRecordingMode && (
              <button 
                onClick={handleStartNewRecording}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Record New Squat
              </button>
            )}
          </div>
        </div>
        
        {/* Main Content Area */}
        <div className="bg-white rounded-xl shadow-lg overflow-hidden flex-1 flex flex-col">
          {isRecordingMode ? (
            /* Recording Mode */
            <div className="flex flex-col flex-1">
              <VideoCapture 
                onFrameCapture={handleFrameCapture} 
                onRecordingComplete={handleRecordingComplete}
              />
              
              {/* Real-time feedback area */}
              {currentFeedback && (
                <div className="p-4 border-t">
                  <h3 className="font-medium mb-2">Real-time Analysis</h3>
                  
                  {/* Squat counter */}
                  {currentFeedback.squatCount !== undefined && (
                    <div className="text-lg">
                      Squats: <span className="font-bold">{currentFeedback.squatCount}</span>
                    </div>
                  )}
                  
                  {/* Current state */}
                  {currentFeedback.squatState && (
                    <div className="mt-2">
                      State: <span className="font-semibold">{currentFeedback.squatState}</span>
                    </div>
                  )}
                  
                  {/* Warnings */}
                  {currentFeedback.warnings && currentFeedback.warnings.length > 0 && (
                    <div className="mt-2">
                      <h4 className="font-medium text-red-600">Form Corrections:</h4>
                      <ul className="list-disc pl-5 mt-1">
                        {currentFeedback.warnings.map((warning, idx) => (
                          <li key={idx} className="text-sm">{warning.message}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            /* Playback Mode */
            activeRecordingIndex !== null && recordings[activeRecordingIndex] && (
              <ExercisePlayback 
                videoUrl={recordings[activeRecordingIndex].videoUrl}
                feedbackData={recordings[activeRecordingIndex].feedbackData}
                squatTimings={recordings[activeRecordingIndex].squatTimings}
              />
            )
          )}
        </div>
        
        {/* Recordings Library */}
        {recordings.length > 0 && (
          <div className="mt-8">
            <h2 className="text-xl font-semibold mb-4">Your Squat Library</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {recordings.map((recording, index) => (
                <div 
                  key={index} 
                  className={`bg-white rounded-lg shadow-md overflow-hidden transition-all ${
                    activeRecordingIndex === index ? 'ring-2 ring-blue-500' : ''
                  }`}
                >
                  {/* Thumbnail (preview frame) */}
                  <div 
                    className="aspect-video bg-gray-900 cursor-pointer" 
                    onClick={() => handleSelectRecording(index)}
                  >
                    <video 
                      src={recording.videoUrl} 
                      className="w-full h-full object-cover"
                      muted
                    />
                  </div>
                  
                  <div className="p-3">
                    {/* Recording details */}
                    <div className="flex justify-between items-center mb-2">
                      <div className="font-medium">Recording {index + 1}</div>
                      <div className="text-sm text-gray-500">
                        Squats: {recording.squatCount || 0}
                      </div>
                    </div>
                    
                    {/* Actions */}
                    <div className="flex justify-between mt-2">
                      <button 
                        onClick={() => handleSelectRecording(index)}
                        className="text-sm text-blue-600 hover:text-blue-800"
                      >
                        Analyze
                      </button>
                      <button 
                        onClick={() => handleDeleteRecording(index)}
                        className="text-sm text-red-600 hover:text-red-800"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
      
      <footer className="bg-gray-800 text-white p-4 mt-12">
        <div className="container mx-auto text-center text-sm">
          <p>Squat Analyzer - A tool to help improve your squat form</p>
        </div>
      </footer>
    </div>
  );
}

export default App;
