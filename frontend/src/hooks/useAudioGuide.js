import { useEffect, useRef, useState } from "react";

export default function useAudioGuide(audioNumber) {
  const audioRef = useRef(null);
  const [isBlocked, setIsBlocked] = useState(false);

  useEffect(() => {
    if (!audioNumber) return;

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }

    const audio = new Audio(`/audio/${audioNumber}.wav`);
    audioRef.current = audio;

    const playAudio = async () => {
      try {
        setIsBlocked(false);
        await audio.play();
      } catch (err) {
        if (err.name === "NotAllowedError") {
          setIsBlocked(true);
        }
      }
    };

    playAudio();

    return () => {
      audio.pause();
      audio.currentTime = 0;
    };
  }, [audioNumber]);

  const playManually = () => {
    if (audioRef.current) {
      setIsBlocked(false);
      audioRef.current.play().catch(() => {});
    }
  };

  return { isBlocked, playManually };
}
