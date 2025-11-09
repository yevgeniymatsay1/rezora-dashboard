import { useState, useEffect } from 'react';

export function useTimezone() {
  const [timezone, setTimezone] = useState<string>('America/New_York');

  useEffect(() => {
    // Detect user's timezone
    const detectedTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    setTimezone(detectedTimezone);
  }, []);

  return timezone;
}