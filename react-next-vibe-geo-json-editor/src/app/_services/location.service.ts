import { useState, useEffect, useCallback } from 'react';

/**
 * Custom hook to get the user's location.
 * @returns {Object} - An object with the user's latitude and longitude, and any potential error.
 */
const useLocation = () => {
    const [location, setLocation] = useState<{ latitude: number | null, longitude: number | null }>({
        latitude: null,
        longitude: null
    });
    const [error, setError] = useState<string | null>(null);

    const getUserLocation = useCallback(() => {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    setLocation({
                        latitude: position.coords.latitude,
                        longitude: position.coords.longitude,
                    });
                },
                (err) => {
                    setError(err.message || 'Unable to retrieve location');
                }
            );
        } else {
            setError('Geolocation is not supported by this browser.');
        }
    }, []);

    useEffect(() => {
        getUserLocation();
    }, [getUserLocation]);

    return { location, error };
};

export default useLocation;
