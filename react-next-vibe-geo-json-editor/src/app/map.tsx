'use client'

import React, { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { MapContainer, Marker, Popup, TileLayer, GeoJSON, useMapEvents } from "react-leaflet";
import { LatLngTuple, Icon, LatLngBounds } from "leaflet";
import { Map as LeafletMap } from 'leaflet';
import { mapDataService } from './_services/index';
import { TopicGroupClass } from "@/_model/model";
// import worldEEZData from '../staticdata/World-EEZ.geo.json';

// Fix for default markers in React Leaflet
delete (Icon.Default.prototype as any)._getIconUrl;
Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

// Create custom small square icon for polygon points
const createSquareIcon = (color: string = '#ff0000', size: number = 4) => {
    const svg = `
        <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
            <rect width="${size}" height="${size}" fill="${color}" stroke="white" stroke-width="0.5"/>
        </svg>
    `;

    return new Icon({
        iconUrl: `data:image/svg+xml;base64,${btoa(svg)}`,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
        popupAnchor: [0, -size / 2],
        className: 'custom-square-icon'
    });
};

const squareIcon = createSquareIcon('#ff0000');
const selectedSquareIcon = createSquareIcon('#ffff00', 6); // Yellow for selected points, slightly larger

// Component to control dragging based on Ctrl key
function DragControl() {
    const map = useMapEvents({});

    useEffect(() => {
        // Disable dragging by default
        map.dragging.disable();

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.ctrlKey || e.metaKey) { // metaKey for Mac Cmd key
                map.dragging.enable();
            }
        };

        const handleKeyUp = (e: KeyboardEvent) => {
            if (!e.ctrlKey && !e.metaKey) {
                map.dragging.disable();
            }
        };

        // Add event listeners to window to capture Ctrl key events
        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);

        // Also check on mouse events (in case Ctrl is released while mouse is down)
        const handleMouseUp = (e: MouseEvent) => {
            if (!e.ctrlKey && !e.metaKey) {
                map.dragging.disable();
            }
        };

        window.addEventListener('mouseup', handleMouseUp);

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
            window.removeEventListener('mouseup', handleMouseUp);
            map.dragging.disable();
        };
    }, [map]);

    return null;
}


// Selection box component
function SelectionBox({
    isDrawing,
    onSelectionComplete
}: {
    isDrawing: boolean;
    onSelectionComplete: (bounds: LatLngBounds) => void;
}) {
    const [currentBox, setCurrentBox] = useState<{ start: LatLngTuple, end: LatLngTuple } | null>(null);

    useMapEvents({
        mousedown: (e) => {
            if (isDrawing) {
                const startPoint: LatLngTuple = [e.latlng.lat, e.latlng.lng];
                setCurrentBox({ start: startPoint, end: startPoint });
            }
        },
        mousemove: (e) => {
            if (isDrawing && currentBox) {
                const endPoint: LatLngTuple = [e.latlng.lat, e.latlng.lng];
                setCurrentBox({ ...currentBox, end: endPoint });
            }
        },
        mouseup: (e) => {
            if (isDrawing && currentBox) {
                const endPoint: LatLngTuple = [e.latlng.lat, e.latlng.lng];
                const bounds = new LatLngBounds(
                    [Math.min(currentBox.start[0], endPoint[0]), Math.min(currentBox.start[1], endPoint[1])],
                    [Math.max(currentBox.start[0], endPoint[0]), Math.max(currentBox.start[1], endPoint[1])]
                );
                onSelectionComplete(bounds);
                setCurrentBox(null);
            }
        }
    });

    return null;
}

interface DisplayPositionProps {
    map: LeafletMap;
    setCurrentMarkers: React.Dispatch<React.SetStateAction<any[]>>;
    setSelectedTopicGroup: React.Dispatch<React.SetStateAction<TopicGroupClass>>;
    isDrawing: boolean;
    setIsDrawing: React.Dispatch<React.SetStateAction<boolean>>;
    selectedPointIds: Set<string>;
    setSelectedPointIds: React.Dispatch<React.SetStateAction<Set<string>>>;
    setSelectedPoints?: React.Dispatch<React.SetStateAction<any[]>>;
    showDeleteMessage: boolean;
    removeSelectedPointsFromGeoJSON: (pointIds: Set<string>) => any;
    setWorldEEZData: React.Dispatch<React.SetStateAction<any>>;
    extractPolygonPoints: (data: any) => any[];
    setPolygonPoints: React.Dispatch<React.SetStateAction<any[]>>;
}

function DisplayPosition({ map, setCurrentMarkers, setSelectedTopicGroup, isDrawing, setIsDrawing, selectedPointIds, setSelectedPointIds, setSelectedPoints, showDeleteMessage, removeSelectedPointsFromGeoJSON, setWorldEEZData, extractPolygonPoints, setPolygonPoints }: DisplayPositionProps) {
    const [position, setPosition] = useState(() => map.getCenter())
    const [pinCount, setPinCount] = useState(0)
    const [loading, setLoading] = useState(true)
    const [showPins, setShowPins] = useState(false)
    const [countriesInView, setcountriesInView] = useState<string[]>([]);


    const onMove = useCallback(() => {
        const requests: Promise<any>[] = [];

        setLoading(true);
        setPosition(map.getCenter())
    }, [map])

    useEffect(() => {

        if (loading) return;
        if (!showPins) return;
        setShowPins(false);

        var temppinCount = 0;
        const markers: any[] = [];

        setPinCount(temppinCount);
        setCurrentMarkers(markers);
    }, [loading, showPins, map, setCurrentMarkers, setSelectedTopicGroup]);


    useEffect(() => {
        map.on('moveend', onMove)
        return () => {
            map.off('moveend', onMove)
        }
    }, [map, onMove])

    useEffect(() => {
        console.log('onLoad');
        onMove();
    }, []);

    return (
        <div style={{ position: 'absolute', top: '10px', left: '10px', zIndex: 1000, background: 'white', padding: '10px', border: '1px solid #ccc', borderRadius: '5px' }}>
            <p>
                pins:{pinCount},
                countriesInView: {countriesInView.map((country: any) => country).join(', ')},
                loading: {loading ? 'true' : 'false'}
            </p>
            <div>
                <button
                    onClick={() => setIsDrawing(!isDrawing)}
                    style={{
                        background: isDrawing ? '#ff0000' : '#00ff00',
                        color: 'white',
                        border: 'none',
                        padding: '5px 10px',
                        margin: '5px',
                        borderRadius: '3px',
                        cursor: 'pointer'
                    }}
                >
                    {isDrawing ? 'Stop Selection' : 'Start Selection'}
                </button>
                <button
                    onClick={() => {
                        if (selectedPointIds.size > 0) {
                            // Remove points from GeoJSON data
                            const updatedGeoJSON = removeSelectedPointsFromGeoJSON(selectedPointIds);
                            if (updatedGeoJSON) {
                                setWorldEEZData(updatedGeoJSON);

                                // Re-extract polygon points from updated data
                                const updatedPoints = extractPolygonPoints(updatedGeoJSON);
                                setPolygonPoints(updatedPoints);
                            }
                        }

                        setSelectedPointIds(new Set());
                        if (setSelectedPoints) {
                            setSelectedPoints([]);
                        }
                    }}
                    style={{
                        background: '#666',
                        color: 'white',
                        border: 'none',
                        padding: '5px 10px',
                        margin: '5px',
                        borderRadius: '3px',
                        cursor: 'pointer'
                    }}
                >
                    Clear Selection ({selectedPointIds.size})
                </button>
            </div>
            {isDrawing && (
                <p style={{ color: 'red', fontSize: '12px', margin: '5px 0' }}>
                    Click and drag to select points
                </p>
            )}
            {showDeleteMessage && (
                <p style={{
                    color: 'white',
                    backgroundColor: '#ff6b6b',
                    fontSize: '12px',
                    margin: '5px 0',
                    padding: '5px 10px',
                    borderRadius: '3px',
                    fontWeight: 'bold'
                }}>
                    ✓ Selected points removed!
                </p>
            )}
        </div>
    )
}


interface MapProps {
    setSelectedTopicGroup: React.Dispatch<React.SetStateAction<TopicGroupClass>>;
    selectedPoints?: any[];
    setSelectedPoints?: React.Dispatch<React.SetStateAction<any[]>>;
    setWorldEEZData?: React.Dispatch<React.SetStateAction<any>>;
}

export default function Map({ setSelectedTopicGroup, selectedPoints, setSelectedPoints, setWorldEEZData: setParentWorldEEZData }: MapProps) {
    const [map, setMap] = useState<LeafletMap | null>(null);
    const [currentMarkers, setCurrentMarkers] = useState<any[]>([]);
    const [worldEEZData, setWorldEEZData] = useState<any>(null);
    const [polygonPoints, setPolygonPoints] = useState<any[]>([]);
    const [selectedPolygonIndex, setSelectedPolygonIndex] = useState<number | null>(null);
    const [selectedPointIds, setSelectedPointIds] = useState<Set<string>>(new Set());
    const [isDrawing, setIsDrawing] = useState(false);
    const [selectionBox, setSelectionBox] = useState<{ start: LatLngTuple, end: LatLngTuple } | null>(null);
    const [showDeleteMessage, setShowDeleteMessage] = useState(false);
    const [geoJsonKey, setGeoJsonKey] = useState(0);

    // Sync worldEEZData to parent component when it changes
    useEffect(() => {
        if (setParentWorldEEZData && worldEEZData) {
            setParentWorldEEZData(worldEEZData);
        }
    }, [worldEEZData, setParentWorldEEZData]);

    const center: LatLngTuple = [0, 0]
    const zoom = 8

    // Debug: Log selection state changes
    useEffect(() => {
        console.log('Selected polygon index:', selectedPolygonIndex);
        if (selectedPolygonIndex === null) {
            console.log('No polygon selected - no points will be shown');
        } else {
            console.log(`Polygon ${selectedPolygonIndex} selected - showing its points`);
        }
    }, [selectedPolygonIndex]);

    // Update GeoJSON key when data changes to force re-render
    const prevDataRef = useRef<any>(null);
    useEffect(() => {
        if (worldEEZData && prevDataRef.current !== worldEEZData) {
            prevDataRef.current = worldEEZData;
            setGeoJsonKey(prev => prev + 1);
        }
    }, [worldEEZData]);

    // Function to update a point position in GeoJSON data
    const updatePointPositionInGeoJSON = useCallback((pointId: string, newLat: number, newLng: number) => {
        if (!worldEEZData) return worldEEZData;

        const [featureIndexStr, pointIndexStr] = pointId.split('-');
        const featureIndex = parseInt(featureIndexStr);
        const pointIndex = parseInt(pointIndexStr);

        const updatedData = {
            ...worldEEZData,
            features: worldEEZData.features.map((feature: any, index: number) => {
                if (index === featureIndex && feature.geometry && feature.geometry.type === 'Polygon') {
                    const coordinates = [...feature.geometry.coordinates[0]];

                    // Update the specific point
                    // GeoJSON coordinates are [lng, lat] but we're working with [lat, lng]
                    if (pointIndex >= 0 && pointIndex < coordinates.length) {
                        coordinates[pointIndex] = [newLng, newLat];
                    }

                    return {
                        ...feature,
                        geometry: {
                            ...feature.geometry,
                            coordinates: [coordinates]
                        }
                    };
                }
                return feature;
            })
        };

        console.log(`Updated point ${pointId} to [${newLat}, ${newLng}]`);
        return updatedData;
    }, [worldEEZData]);

    // Function to remove selected points from GeoJSON data
    const removeSelectedPointsFromGeoJSON = useCallback((pointIdsToRemove: Set<string>) => {
        if (!worldEEZData || pointIdsToRemove.size === 0) return worldEEZData;

        const updatedData = {
            ...worldEEZData,
            features: worldEEZData.features.map((feature: any) => {
                if (feature.geometry && feature.geometry.type === 'Polygon') {
                    const featureIndex = feature.properties?.featureIndex;
                    if (featureIndex !== undefined) {
                        // Find points to remove for this feature
                        const pointsToRemove = Array.from(pointIdsToRemove).filter(id =>
                            id.startsWith(`${featureIndex}-`)
                        );

                        if (pointsToRemove.length > 0) {
                            // Get the point indices to remove
                            const indicesToRemove = pointsToRemove.map(id =>
                                parseInt(id.split('-')[1])
                            ).sort((a, b) => b - a); // Sort in descending order for safe removal

                            // Remove points from coordinates (outer ring only)
                            const newCoordinates = [...feature.geometry.coordinates[0]];
                            indicesToRemove.forEach(index => {
                                if (index >= 0 && index < newCoordinates.length) {
                                    newCoordinates.splice(index, 1);
                                }
                            });

                            // Ensure polygon has at least 3 points (minimum for a valid polygon)
                            if (newCoordinates.length >= 3) {
                                return {
                                    ...feature,
                                    geometry: {
                                        ...feature.geometry,
                                        coordinates: [newCoordinates]
                                    }
                                };
                            }
                        }
                    }
                }
                return feature;
            }).filter((feature: any) => {
                // Remove features that have less than 3 points (invalid polygons)
                if (feature.geometry && feature.geometry.type === 'Polygon') {
                    return feature.geometry.coordinates[0].length >= 3;
                }
                return true;
            })
        };

        console.log(`Removed ${pointIdsToRemove.size} points from GeoJSON data`);
        return updatedData;
    }, [worldEEZData]);

    // Handle keyboard events for point removal
    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Delete' || event.key === 'Backspace') {
                if (selectedPointIds.size > 0) {
                    console.log('Delete key pressed - removing selected points');

                    // Remove points from GeoJSON data
                    const updatedGeoJSON = removeSelectedPointsFromGeoJSON(selectedPointIds);
                    if (updatedGeoJSON) {
                        setWorldEEZData(updatedGeoJSON);

                        // Re-extract polygon points from updated data
                        const updatedPoints = extractPolygonPoints(updatedGeoJSON);
                        setPolygonPoints(updatedPoints);
                    }

                    setSelectedPointIds(new Set());
                    if (setSelectedPoints) {
                        setSelectedPoints([]);
                    }
                    // Show delete message briefly
                    setShowDeleteMessage(true);
                    setTimeout(() => setShowDeleteMessage(false), 2000);
                }
            }
        };

        // Add event listener to document
        document.addEventListener('keydown', handleKeyDown);

        // Cleanup event listener on component unmount
        return () => {
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [selectedPointIds, setSelectedPoints, removeSelectedPointsFromGeoJSON]);

    // Handle selection box completion
    const handleSelectionComplete = useCallback((bounds: LatLngBounds) => {
        console.log('Selection box completed:', bounds);
        const pointsInBounds = polygonPoints.filter(point =>
            bounds.contains([point.position[0], point.position[1]])
        );
        console.log(`Found ${pointsInBounds.length} points in selection box`);

        const newSelectedIds = new Set(selectedPointIds);
        pointsInBounds.forEach(point => {
            newSelectedIds.add(point.id);
        });
        setSelectedPointIds(newSelectedIds);

        // Update the selected points for the sidebar
        if (setSelectedPoints) {
            const selectedPointsList = polygonPoints.filter(point => newSelectedIds.has(point.id));
            setSelectedPoints(selectedPointsList);
        }

        setIsDrawing(false);
    }, [polygonPoints, selectedPointIds, setSelectedPoints]);

    // Function to extract all coordinate points from GeoJSON
    const extractPolygonPoints = useCallback((geoJsonData: any) => {
        const points: any[] = [];

        if (geoJsonData && geoJsonData.features) {
            geoJsonData.features.forEach((feature: any, featureIndex: number) => {
                if (feature.geometry && feature.geometry.type === 'Polygon') {
                    const coordinates = feature.geometry.coordinates[0]; // Get outer ring
                    coordinates.forEach((coord: number[], pointIndex: number) => {
                        points.push({
                            id: `${featureIndex}-${pointIndex}`,
                            position: [coord[1], coord[0]] as LatLngTuple, // [lat, lng]
                            featureIndex,
                            pointIndex,
                            country: feature.properties?.Country || 'Unknown',
                            iso: feature.properties?.ISO_A3 || 'N/A'
                        });
                    });
                }
            });
        }

        console.log(`Extracted ${points.length} polygon points`);
        return points;
    }, []);

    // Load geo.json data
    useEffect(() => {
        console.log('Attempting to load EEZ data...');
        fetch('/World-EEZ.geo.json')
            .then(response => {
                console.log('Response status:', response.status);
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                return response.json();
            })
            .then(data => {
                console.log('Loaded EEZ data successfully:', data);
                console.log('Number of features:', data.features ? data.features.length : 'No features array');

                // Add featureIndex to each feature for selection tracking
                const processedData = {
                    ...data,
                    features: data.features.map((feature: any, index: number) => ({
                        ...feature,
                        properties: {
                            ...feature.properties,
                            featureIndex: index
                        }
                    }))
                };

                setWorldEEZData(processedData);

                // Extract polygon points
                const points = extractPolygonPoints(processedData);
                setPolygonPoints(points);
            })
            .catch(error => {
                console.error('Error loading EEZ data:', error);
            });
    }, []);

    // Style function for EEZ polygons
    const styleEEZ = (feature: any) => {
        const featureIndex = feature.properties?.featureIndex || 0;
        const isSelected = selectedPolygonIndex === featureIndex;

        return {
            fillColor: isSelected ? '#007f00' : '#7f0000', // Green if selected, red if not
            weight: isSelected ? 3 : 2, // Thicker border if selected
            opacity: 1,
            color: isSelected ? '#00ff00' : '#ff0000',
            fillOpacity: isSelected ? 0.5 : 0.3 // More opaque if selected
        };
    };

    // Event handlers for EEZ polygons
    const onEachFeature = (feature: any, layer: any) => {
        const featureIndex = feature.properties?.featureIndex || 0;

        // Add click handler for polygon selection
        layer.on('click', (e: any) => {
            console.log('Polygon clicked:', featureIndex, feature.properties?.Country);
            if (selectedPolygonIndex === featureIndex) {
                // If clicking the same polygon, deselect it
                setSelectedPolygonIndex(null);
            } else {
                // Select this polygon
                setSelectedPolygonIndex(featureIndex);
            }
        });

        if (feature.properties && feature.properties.Country) {
            layer.bindPopup(`<b>${feature.properties.Country}</b><br/>ISO: ${feature.properties.ISO_A3 || 'N/A'}<br/><br/>Click to ${selectedPolygonIndex === featureIndex ? 'deselect' : 'select'} this polygon`);
        }
    };

    const displayMap = useMemo(
        () => (
            <MapContainer className="map-wrap"
                center={center}
                zoom={zoom}
                scrollWheelZoom={true}
                ref={setMap}
                whenReady={() => {
                    console.log('Map ready, loading EEZ data...');
                    console.log('EEZ data:', worldEEZData);
                }}>
                <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <DragControl />
                <SelectionBox
                    isDrawing={isDrawing}
                    onSelectionComplete={handleSelectionComplete}
                />
                {worldEEZData && (
                    <GeoJSON
                        key={`geojson-${geoJsonKey}`}
                        data={worldEEZData}
                        style={styleEEZ}
                        onEachFeature={onEachFeature}
                    />
                )}
                {polygonPoints
                    .filter(point => selectedPolygonIndex !== null && point.featureIndex === selectedPolygonIndex)
                    .map((point) => {
                        const isSelected = selectedPointIds.has(point.id);
                        return (
                            <Marker
                                key={point.id}
                                position={point.position}
                                icon={isSelected ? selectedSquareIcon : squareIcon}
                                draggable={true}
                                eventHandlers={{
                                    dragend: (e) => {
                                        const marker = e.target;
                                        const newPosition = marker.getLatLng();
                                        const newLat = newPosition.lat;
                                        const newLng = newPosition.lng;

                                        console.log(`Point ${point.id} moved to [${newLat}, ${newLng}]`);

                                        // Update GeoJSON data
                                        const updatedGeoJSON = updatePointPositionInGeoJSON(point.id, newLat, newLng);
                                        if (updatedGeoJSON) {
                                            setWorldEEZData(updatedGeoJSON);

                                            // Re-extract polygon points from updated data
                                            const updatedPoints = extractPolygonPoints(updatedGeoJSON);
                                            setPolygonPoints(updatedPoints);

                                            // Update selected points if this point is selected
                                            if (setSelectedPoints && isSelected) {
                                                const selectedPointsList = updatedPoints.filter(p => selectedPointIds.has(p.id));
                                                setSelectedPoints(selectedPointsList);
                                            }
                                        }
                                    }
                                }}
                            >
                                <Popup>
                                    <div>
                                        <strong>Polygon Point {isSelected ? '(Selected)' : ''}</strong><br />
                                        Country: {point.country}<br />
                                        ISO: {point.iso}<br />
                                        Feature: {point.featureIndex}<br />
                                        Point: {point.pointIndex}<br />
                                        Lat: {point.position[0].toFixed(6)}<br />
                                        Lng: {point.position[1].toFixed(6)}<br />
                                        <em>Drag to move this point</em>
                                    </div>
                                </Popup>
                            </Marker>
                        );
                    })}
                {currentMarkers}
            </MapContainer>
        ),
        [currentMarkers, worldEEZData, polygonPoints, selectedPolygonIndex, selectedPointIds, isDrawing, showDeleteMessage, updatePointPositionInGeoJSON, extractPolygonPoints, setPolygonPoints, setWorldEEZData, setSelectedPoints, geoJsonKey],
    )

    return (
        <div className="map-wrap">
            {map ? <DisplayPosition
                map={map}
                setCurrentMarkers={setCurrentMarkers}
                setSelectedTopicGroup={setSelectedTopicGroup}
                isDrawing={isDrawing}
                setIsDrawing={setIsDrawing}
                selectedPointIds={selectedPointIds}
                setSelectedPointIds={setSelectedPointIds}
                setSelectedPoints={setSelectedPoints}
                showDeleteMessage={showDeleteMessage}
                removeSelectedPointsFromGeoJSON={removeSelectedPointsFromGeoJSON}
                setWorldEEZData={setWorldEEZData}
                extractPolygonPoints={extractPolygonPoints}
                setPolygonPoints={setPolygonPoints}
            /> : null}
            {displayMap}
        </div>
    )
}