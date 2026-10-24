'use client'

import React, { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { MapContainer, Marker, Popup, TileLayer, GeoJSON, Rectangle, useMapEvents } from "react-leaflet";
import { LatLngTuple, Icon, LatLngBounds, DomEvent, LeafletMouseEvent } from "leaflet";
import { Map as LeafletMap } from 'leaflet';
import { booleanValid, booleanWithin } from "@turf/turf";
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
    const hitAreaSize = 16;
    const squareOffset = (hitAreaSize - size) / 2;
    const svg = `
        <svg width="${hitAreaSize}" height="${hitAreaSize}" xmlns="http://www.w3.org/2000/svg">
            <rect x="${squareOffset}" y="${squareOffset}" width="${size}" height="${size}" fill="${color}" stroke="white" stroke-width="0.5"/>
        </svg>
    `;

    return new Icon({
        iconUrl: `data:image/svg+xml;base64,${btoa(svg)}`,
        iconSize: [hitAreaSize, hitAreaSize],
        iconAnchor: [hitAreaSize / 2, hitAreaSize / 2],
        popupAnchor: [0, -hitAreaSize / 2],
        className: 'custom-square-icon'
    });
};

const squareIcon = createSquareIcon('#ff0000');
const selectedSquareIcon = createSquareIcon('#ffff00', 6); // Yellow for selected points, slightly larger

export function prepareGeoJSONForEditor(data: any) {
    if (!data || data.type !== 'FeatureCollection' || !Array.isArray(data.features)) {
        throw new Error('Expected a GeoJSON FeatureCollection with a features array');
    }
    return {
        ...data,
        features: data.features.map((feature: any, index: number) => ({
            ...feature,
            properties: {
                ...feature.properties,
                featureIndex: index,
            },
        })),
    };
}

function simplifyGeometryWithoutReducingCoverage(geometry: any): { geometry: any; removed: number } {
    if (geometry.type !== 'Polygon' && geometry.type !== 'MultiPolygon') {
        return { geometry, removed: 0 };
    }

    const originalGeometry = structuredClone(geometry);
    const simplifiedGeometry = structuredClone(geometry);
    const polygons: number[][][][] = geometry.type === 'Polygon'
        ? [simplifiedGeometry.coordinates]
        : simplifiedGeometry.coordinates;
    let removed = 0;

    for (const polygon of polygons) {
        for (let ringIndex = 0; ringIndex < polygon.length; ringIndex++) {
            const ring = polygon[ringIndex];
            let signedArea = 0;
            for (let pointIndex = 0; pointIndex < ring.length - 1; pointIndex++) {
                const current = ring[pointIndex];
                const next = ring[pointIndex + 1];
                signedArea += current[0] * next[1] - next[0] * current[1];
            }

            let index = 1;
            while (ring.length > 4 && index < ring.length - 1) {
                const previous = ring[index - 1];
                const current = ring[index];
                const next = ring[index + 1];
                const cross = (current[0] - previous[0]) * (next[1] - current[1])
                    - (current[1] - previous[1]) * (next[0] - current[0]);
                const isCollinear = cross === 0;
                const isConvex = cross * signedArea > 0;
                const canRemove = isCollinear || (ringIndex === 0 ? !isConvex : isConvex);

                if (canRemove) {
                    ring.splice(index, 1);
                    removed++;
                } else {
                    index++;
                }
            }
        }
    }

    if (removed === 0 || !booleanValid(simplifiedGeometry) || !booleanWithin(originalGeometry, simplifiedGeometry)) {
        return { geometry, removed: 0 };
    }
    return { geometry: simplifiedGeometry, removed };
}

export type MapInteractionMode = 'move' | 'select';

function isClosedRing(ring: number[][]): boolean {
    if (ring.length < 2) {
        return false;
    }
    const first = ring[0];
    const last = ring[ring.length - 1];
    return first[0] === last[0] && first[1] === last[1];
}

function moveRingPoint(ring: number[][], pointIndex: number, position: number[]): number[][] {
    const updatedRing = ring.map(coordinate => [...coordinate]);
    if (pointIndex < 0 || pointIndex >= updatedRing.length) {
        return updatedRing;
    }

    updatedRing[pointIndex] = position;
    if (isClosedRing(ring)) {
        if (pointIndex === 0) {
            updatedRing[updatedRing.length - 1] = [...position];
        } else if (pointIndex === ring.length - 1) {
            updatedRing[0] = [...position];
        }
    }
    return updatedRing;
}

function removeRingPoints(ring: number[][], indicesToRemove: number[]): number[][] | null {
    const isClosed = isClosedRing(ring);
    const openRing = isClosed ? ring.slice(0, -1) : ring;
    const indices = new Set(indicesToRemove);
    const remaining = openRing.filter((_, index) => !indices.has(index));
    if (remaining.length < 3) {
        return null;
    }
    return isClosed ? [...remaining, [...remaining[0]]] : remaining;
}

function isVertexMarkerTarget(target: EventTarget | null): boolean {
    if (!(target instanceof Element)) {
        return false;
    }
    return Boolean(target.closest('.leaflet-marker-icon'));
}

// Pan the map by left-dragging anywhere (except vertex markers) in move mode
function MapPanControl({ interactionMode }: { interactionMode: MapInteractionMode }) {
    const map = useMapEvents({});
    const panningRef = useRef(false);
    const lastPointRef = useRef<{ x: number; y: number } | null>(null);
    const hasPannedRef = useRef(false);
    const suppressClickRef = useRef(false);
    const suppressClickTimeoutRef = useRef<number | null>(null);
    const interactionModeRef = useRef(interactionMode);
    interactionModeRef.current = interactionMode;

    useEffect(() => {
        map.dragging.disable();

        const onDocumentMouseMove = (e: MouseEvent) => {
            if (!panningRef.current || !lastPointRef.current) {
                return;
            }
            const dx = e.clientX - lastPointRef.current.x;
            const dy = e.clientY - lastPointRef.current.y;
            if (dx !== 0 || dy !== 0) {
                hasPannedRef.current = true;
                map.panBy([-dx, -dy], { animate: false });
            }
            lastPointRef.current = { x: e.clientX, y: e.clientY };
        };

        const endPan = () => {
            if (panningRef.current && hasPannedRef.current) {
                suppressClickRef.current = true;
                suppressClickTimeoutRef.current = window.setTimeout(() => {
                    suppressClickRef.current = false;
                    suppressClickTimeoutRef.current = null;
                }, 0);
            }
            panningRef.current = false;
            hasPannedRef.current = false;
            lastPointRef.current = null;
        };

        const onMapClickCapture = (e: MouseEvent) => {
            if (!suppressClickRef.current) {
                return;
            }
            suppressClickRef.current = false;
            if (suppressClickTimeoutRef.current !== null) {
                window.clearTimeout(suppressClickTimeoutRef.current);
                suppressClickTimeoutRef.current = null;
            }
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
        };

        const onMouseDown = (e: LeafletMouseEvent) => {
            if (interactionModeRef.current !== 'move') {
                return;
            }
            if (e.originalEvent.button !== 0) {
                return;
            }
            if (isVertexMarkerTarget(e.originalEvent.target)) {
                return;
            }
            if (e.originalEvent.target instanceof Element && e.originalEvent.target.closest('.leaflet-popup')) {
                return;
            }
            panningRef.current = true;
            lastPointRef.current = {
                x: e.originalEvent.clientX,
                y: e.originalEvent.clientY,
            };
            DomEvent.stopPropagation(e);
        };

        map.getContainer().addEventListener('click', onMapClickCapture, true);
        map.on('mousedown', onMouseDown);
        document.addEventListener('mousemove', onDocumentMouseMove);
        document.addEventListener('mouseup', endPan);

        return () => {
            map.getContainer().removeEventListener('click', onMapClickCapture, true);
            map.off('mousedown', onMouseDown);
            document.removeEventListener('mousemove', onDocumentMouseMove);
            document.removeEventListener('mouseup', endPan);
            endPan();
            if (suppressClickTimeoutRef.current !== null) {
                window.clearTimeout(suppressClickTimeoutRef.current);
                suppressClickTimeoutRef.current = null;
            }
            suppressClickRef.current = false;
            map.dragging.disable();
        };
    }, [map]);

    return null;
}


// Selection box component
function SelectionBox({
    interactionMode,
    onSelectionComplete
}: {
    interactionMode: MapInteractionMode;
    onSelectionComplete: (bounds: LatLngBounds) => void;
}) {
    const [currentBox, setCurrentBox] = useState<{ start: LatLngTuple, end: LatLngTuple } | null>(null);

    useMapEvents({
        mousedown: (e) => {
            if (interactionMode !== 'select') {
                return;
            }
            if (e.originalEvent.button !== 0) {
                return;
            }
            if (isVertexMarkerTarget(e.originalEvent.target)) {
                return;
            }
            const startPoint: LatLngTuple = [e.latlng.lat, e.latlng.lng];
            setCurrentBox({ start: startPoint, end: startPoint });
            DomEvent.stopPropagation(e);
        },
        mousemove: (e) => {
            if (interactionMode !== 'select' || !currentBox) {
                return;
            }
            const endPoint: LatLngTuple = [e.latlng.lat, e.latlng.lng];
            setCurrentBox({ ...currentBox, end: endPoint });
        },
        mouseup: (e) => {
            if (interactionMode !== 'select' || !currentBox) {
                return;
            }
            const endPoint: LatLngTuple = [e.latlng.lat, e.latlng.lng];
            const latSpan = Math.abs(currentBox.start[0] - endPoint[0]);
            const lngSpan = Math.abs(currentBox.start[1] - endPoint[1]);
            if (latSpan < 1e-7 && lngSpan < 1e-7) {
                setCurrentBox(null);
                return;
            }
            const bounds = new LatLngBounds(
                [Math.min(currentBox.start[0], endPoint[0]), Math.min(currentBox.start[1], endPoint[1])],
                [Math.max(currentBox.start[0], endPoint[0]), Math.max(currentBox.start[1], endPoint[1])]
            );
            onSelectionComplete(bounds);
            setCurrentBox(null);
        }
    });

    if (!currentBox) {
        return null;
    }

    return (
        <Rectangle
            bounds={new LatLngBounds(currentBox.start, currentBox.end)}
            pathOptions={{
                color: '#3388ff',
                weight: 2,
                fillColor: '#3388ff',
                fillOpacity: 0.15,
                dashArray: '4, 4',
            }}
            interactive={false}
        />
    );
}

interface DisplayPositionProps {
    map: LeafletMap;
    setCurrentMarkers: React.Dispatch<React.SetStateAction<any[]>>;
    setSelectedTopicGroup: React.Dispatch<React.SetStateAction<TopicGroupClass>>;
    interactionMode: MapInteractionMode;
    setInteractionMode: React.Dispatch<React.SetStateAction<MapInteractionMode>>;
    selectedPolygonIndex: number | null;
    selectedPointIds: Set<string>;
    setSelectedPointIds: React.Dispatch<React.SetStateAction<Set<string>>>;
    setSelectedPoints?: React.Dispatch<React.SetStateAction<any[]>>;
    showDeleteMessage: boolean;
    removeSelectedPointsFromGeoJSON: (pointIds: Set<string>) => any;
    setWorldEEZData: React.Dispatch<React.SetStateAction<any>>;
    extractPolygonPoints: (data: any) => any[];
    setPolygonPoints: React.Dispatch<React.SetStateAction<any[]>>;
    simplifySelectedPolygon: (featureIndex: number) => { removed: number; message: string };
}

function DisplayPosition({ map, setCurrentMarkers, setSelectedTopicGroup, interactionMode, setInteractionMode, selectedPolygonIndex, selectedPointIds, setSelectedPointIds, setSelectedPoints, showDeleteMessage, removeSelectedPointsFromGeoJSON, setWorldEEZData, extractPolygonPoints, setPolygonPoints, simplifySelectedPolygon }: DisplayPositionProps) {
    const [position, setPosition] = useState(() => map.getCenter())
    const [pinCount, setPinCount] = useState(0)
    const [loading, setLoading] = useState(true)
    const [showPins, setShowPins] = useState(false)
    const [countriesInView, setcountriesInView] = useState<string[]>([]);
    const [simplifyMessage, setSimplifyMessage] = useState('');


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
                <div style={{ margin: '5px 0', fontSize: '12px', fontWeight: 'bold' }}>Mode</div>
                <button
                    type="button"
                    onClick={() => setInteractionMode('move')}
                    style={{
                        background: interactionMode === 'move' ? '#1976d2' : '#e0e0e0',
                        color: interactionMode === 'move' ? 'white' : '#333',
                        border: 'none',
                        padding: '5px 10px',
                        margin: '5px 5px 5px 0',
                        borderRadius: '3px',
                        cursor: 'pointer',
                    }}
                >
                    Map movement
                </button>
                <button
                    type="button"
                    onClick={() => setInteractionMode('select')}
                    style={{
                        background: interactionMode === 'select' ? '#c62828' : '#e0e0e0',
                        color: interactionMode === 'select' ? 'white' : '#333',
                        border: 'none',
                        padding: '5px 10px',
                        margin: '5px 0',
                        borderRadius: '3px',
                        cursor: 'pointer',
                    }}
                >
                    Point selection
                </button>
                <button
                    onClick={() => {
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
                <button
                    type="button"
                    disabled={selectedPolygonIndex === null}
                    onClick={() => {
                        if (selectedPolygonIndex === null) {
                            return;
                        }
                        const result = simplifySelectedPolygon(selectedPolygonIndex);
                        setSimplifyMessage(result.message);
                    }}
                    style={{
                        background: selectedPolygonIndex === null ? '#e0e0e0' : '#1976d2',
                        color: selectedPolygonIndex === null ? '#777' : 'white',
                        border: 'none',
                        padding: '5px 10px',
                        margin: '5px',
                        borderRadius: '3px',
                        cursor: selectedPolygonIndex === null ? 'not-allowed' : 'pointer',
                    }}
                >
                    Simplify Polygon
                </button>
            </div>
            {simplifyMessage && (
                <p role="status" style={{ color: '#333', fontSize: '12px', margin: '5px 0' }}>
                    {simplifyMessage}
                </p>
            )}
            {interactionMode === 'move' && (
                <p style={{ color: '#1976d2', fontSize: '12px', margin: '5px 0' }}>
                    Drag the map to pan or drag a vertex to move it. Click a polygon to choose it for editing.
                </p>
            )}
            {interactionMode === 'select' && (
                <p style={{ color: '#c62828', fontSize: '12px', margin: '5px 0' }}>
                    {selectedPolygonIndex === null
                        ? 'Select a polygon first, then drag a box over its points.'
                        : 'Drag a box to select points or drag an individual vertex to move it. Press Delete to remove selected points.'}
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


export type GeoJSONImportRequest = { data: any; id: number };

interface MapProps {
    setSelectedTopicGroup: React.Dispatch<React.SetStateAction<TopicGroupClass>>;
    selectedPoints?: any[];
    setSelectedPoints?: React.Dispatch<React.SetStateAction<any[]>>;
    setWorldEEZData?: React.Dispatch<React.SetStateAction<any>>;
    importedGeoJSON?: GeoJSONImportRequest | null;
    onImportedGeoJSONApplied?: () => void;
}

export default function Map({
    setSelectedTopicGroup,
    selectedPoints,
    setSelectedPoints,
    setWorldEEZData: setParentWorldEEZData,
    importedGeoJSON,
    onImportedGeoJSONApplied,
}: MapProps) {
    const [map, setMap] = useState<LeafletMap | null>(null);
    const [currentMarkers, setCurrentMarkers] = useState<any[]>([]);
    const [worldEEZData, setWorldEEZData] = useState<any>(null);
    const [polygonPoints, setPolygonPoints] = useState<any[]>([]);
    const [selectedPolygonIndex, setSelectedPolygonIndex] = useState<number | null>(null);
    const [selectedPointIds, setSelectedPointIds] = useState<Set<string>>(new Set());
    const [interactionMode, setInteractionMode] = useState<MapInteractionMode>('move');
    const interactionModeRef = useRef(interactionMode);
    const [showDeleteMessage, setShowDeleteMessage] = useState(false);
    const [geoJsonKey, setGeoJsonKey] = useState(0);
    const undoStackRef = useRef<any[]>([]);
    const redoStackRef = useRef<any[]>([]);
    const worldEEZDataRef = useRef<any>(null);
    const MAX_UNDO_HISTORY = 50;

    worldEEZDataRef.current = worldEEZData;
    interactionModeRef.current = interactionMode;

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

        const parts = pointId.split('-');
        const featureIndex = parseInt(parts[0]);
        const polygonIndex = parseInt(parts[1]);
        const pointIndex = parseInt(parts[2]);

        const updatedData = {
            ...worldEEZData,
            features: worldEEZData.features.map((feature: any, index: number) => {
                // Always ensure featureIndex is preserved in properties
                const updatedFeature = {
                    ...feature,
                    properties: {
                        ...feature.properties,
                        featureIndex: index
                    }
                };

                if (index === featureIndex && feature.geometry) {
                    if (feature.geometry.type === 'Polygon') {
                        const coordinates = feature.geometry.coordinates.map((ring: number[][], ringIndex: number) =>
                            ringIndex === 0 && polygonIndex === 0
                                ? moveRingPoint(ring, pointIndex, [newLng, newLat])
                                : ring
                        );

                        return {
                            ...updatedFeature,
                            geometry: {
                                ...feature.geometry,
                                coordinates
                            }
                        };
                    } else if (feature.geometry.type === 'MultiPolygon') {
                        const polygons = feature.geometry.coordinates.map((polygon: number[][][], idx: number) => {
                            if (idx === polygonIndex) {
                                const rings = polygon.map((ring: number[][], ringIdx: number) => {
                                    if (ringIdx === 0) {
                                        return moveRingPoint(ring, pointIndex, [newLng, newLat]);
                                    }
                                    return ring;
                                });
                                return rings;
                            }
                            return polygon;
                        });

                        return {
                            ...updatedFeature,
                            geometry: {
                                ...feature.geometry,
                                coordinates: polygons
                            }
                        };
                    }
                }
                return updatedFeature;
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
            features: worldEEZData.features.map((feature: any, featureIndex: number) => {
                if (feature.geometry) {
                    // Find points to remove for this feature
                    const pointsToRemove = Array.from(pointIdsToRemove).filter(id => {
                        const parts = id.split('-');
                        return parts.length >= 3 && parseInt(parts[0]) === featureIndex;
                    });

                    if (pointsToRemove.length > 0) {
                        if (feature.geometry.type === 'Polygon') {
                            // Get point indices to remove (polygonIndex should be 0 for regular polygons)
                            const indicesToRemove = pointsToRemove
                                .filter(id => {
                                    const parts = id.split('-');
                                    return parseInt(parts[1]) === 0; // Only remove from outer polygon
                                })
                                .map(id => parseInt(id.split('-')[2])) // Get pointIndex
                                .sort((a, b) => b - a); // Sort in descending order for safe removal

                            if (indicesToRemove.length > 0) {
                                const newOuterRing = removeRingPoints(feature.geometry.coordinates[0], indicesToRemove);
                                if (newOuterRing) {
                                    return {
                                        ...feature,
                                        geometry: {
                                            ...feature.geometry,
                                            coordinates: [newOuterRing, ...feature.geometry.coordinates.slice(1)]
                                        }
                                    };
                                }
                                // If less than 3 points, return null to filter it out
                                return null;
                            }
                        } else if (feature.geometry.type === 'MultiPolygon') {
                            // Group points by polygon index
                            const pointsByPolygon: { [key: number]: number[] } = {};
                            pointsToRemove.forEach(id => {
                                const parts = id.split('-');
                                const polygonIndex = parseInt(parts[1]);
                                const pointIndex = parseInt(parts[2]);
                                if (!pointsByPolygon[polygonIndex]) {
                                    pointsByPolygon[polygonIndex] = [];
                                }
                                pointsByPolygon[polygonIndex].push(pointIndex);
                            });

                            // Remove points from each polygon
                            const newPolygons = feature.geometry.coordinates.map((polygon: number[][][], polygonIndex: number) => {
                                const indicesToRemove = pointsByPolygon[polygonIndex];
                                if (indicesToRemove && indicesToRemove.length > 0) {
                                    const outerRing = removeRingPoints(polygon[0], indicesToRemove);
                                    if (outerRing) {
                                        return [outerRing, ...polygon.slice(1)];
                                    }
                                    // If less than 3 points, return null to filter out this polygon
                                    return null;
                                }
                                return polygon;
                            }).filter((polygon: any) => polygon !== null);

                            // Only return feature if it has at least one valid polygon
                            if (newPolygons.length > 0) {
                                return {
                                    ...feature,
                                    geometry: {
                                        ...feature.geometry,
                                        coordinates: newPolygons
                                    }
                                };
                            }
                            // If no valid polygons remain, return null to filter out
                            return null;
                        }
                    }
                }
                return feature;
            }).filter((feature: any) => {
                // Remove features that are null or have invalid geometries
                if (!feature) return false;

                // Validate Polygon geometries
                if (feature.geometry && feature.geometry.type === 'Polygon') {
                    return feature.geometry.coordinates[0] && feature.geometry.coordinates[0].length >= 3;
                }

                // Validate MultiPolygon geometries
                if (feature.geometry && feature.geometry.type === 'MultiPolygon') {
                    return feature.geometry.coordinates && feature.geometry.coordinates.length > 0;
                }

                return true;
            })
        };

        console.log(`Removed ${pointIdsToRemove.size} points from GeoJSON data`);
        return updatedData;
    }, [worldEEZData]);

    // Handle selection box completion
    const handleSelectionComplete = useCallback((bounds: LatLngBounds) => {
        if (selectedPolygonIndex === null) {
            return;
        }
        console.log('Selection box completed:', bounds);
        const pointsInBounds = polygonPoints.filter(point =>
            point.featureIndex === selectedPolygonIndex &&
            bounds.contains([point.position[0], point.position[1]])
        );
        console.log(`Found ${pointsInBounds.length} points in selection box`);

        const newSelectedIds = new Set(selectedPointIds);
        pointsInBounds.forEach(point => {
            newSelectedIds.add(point.id);
        });
        setSelectedPointIds(newSelectedIds);

        if (setSelectedPoints) {
            const selectedPointsList = polygonPoints.filter(point => newSelectedIds.has(point.id));
            setSelectedPoints(selectedPointsList);
        }
    }, [polygonPoints, selectedPointIds, selectedPolygonIndex, setSelectedPoints]);

    const extractPolygonPoints = useCallback((geoJsonData: any) => {
        const points: any[] = [];

        if (geoJsonData && geoJsonData.features) {
            geoJsonData.features.forEach((feature: any, featureIndex: number) => {
                if (feature.geometry) {
                    if (feature.geometry.type === 'Polygon') {
                        const coordinates = feature.geometry.coordinates[0]; // Get outer ring
                        const vertexCount = isClosedRing(coordinates) ? coordinates.length - 1 : coordinates.length;
                        coordinates.slice(0, vertexCount).forEach((coord: number[], pointIndex: number) => {
                            points.push({
                                id: `${featureIndex}-0-${pointIndex}`, // polygonIndex is 0 for regular polygons
                                position: [coord[1], coord[0]] as LatLngTuple, // [lat, lng]
                                featureIndex,
                                polygonIndex: 0,
                                pointIndex,
                                country: feature.properties?.Country || 'Unknown',
                                iso: feature.properties?.ISO_A3 || 'N/A'
                            });
                        });
                    } else if (feature.geometry.type === 'MultiPolygon') {
                        // MultiPolygon: coordinates is array of polygons, each polygon has rings
                        feature.geometry.coordinates.forEach((polygon: number[][][], polygonIndex: number) => {
                            const outerRing = polygon[0]; // First ring is outer ring
                            const vertexCount = isClosedRing(outerRing) ? outerRing.length - 1 : outerRing.length;
                            outerRing.slice(0, vertexCount).forEach((coord: number[], pointIndex: number) => {
                                points.push({
                                    id: `${featureIndex}-${polygonIndex}-${pointIndex}`,
                                    position: [coord[1], coord[0]] as LatLngTuple, // [lat, lng]
                                    featureIndex,
                                    polygonIndex,
                                    pointIndex,
                                    country: feature.properties?.Country || 'Unknown',
                                    iso: feature.properties?.ISO_A3 || 'N/A'
                                });
                            });
                        });
                    }
                }
            });
        }

        console.log(`Extracted ${points.length} polygon points`);
        return points;
    }, []);

    const applyGeoJSONState = useCallback((data: any) => {
        setWorldEEZData(data);
        setPolygonPoints(extractPolygonPoints(data));
    }, [extractPolygonPoints]);

    const commitGeoJSONChange = useCallback((newData: any) => {
        const current = worldEEZDataRef.current;
        if (current) {
            undoStackRef.current.push(structuredClone(current));
            if (undoStackRef.current.length > MAX_UNDO_HISTORY) {
                undoStackRef.current.shift();
            }
            redoStackRef.current = [];
        }
        applyGeoJSONState(newData);
    }, [applyGeoJSONState]);

    const simplifySelectedPolygon = useCallback((featureIndex: number) => {
        const feature = worldEEZData?.features?.[featureIndex];
        if (!feature?.geometry || (feature.geometry.type !== 'Polygon' && feature.geometry.type !== 'MultiPolygon')) {
            return { removed: 0, message: 'The selected feature is not a polygon.' };
        }

        if (!booleanValid(feature.geometry)) {
            return { removed: 0, message: 'The selected polygon is invalid and cannot be simplified safely.' };
        }

        const result = simplifyGeometryWithoutReducingCoverage(feature.geometry);
        if (result.removed === 0) {
            return { removed: 0, message: 'No vertices can be safely removed without reducing coverage.' };
        }

        const updatedData = {
            ...worldEEZData,
            features: worldEEZData.features.map((currentFeature: any, index: number) =>
                index === featureIndex
                    ? { ...currentFeature, geometry: result.geometry }
                    : currentFeature
            ),
        };
        commitGeoJSONChange(updatedData);
        setSelectedPointIds(new Set());
        if (setSelectedPoints) {
            setSelectedPoints([]);
        }

        return {
            removed: result.removed,
            message: `Removed ${result.removed} ${result.removed === 1 ? 'point' : 'points'} without reducing coverage.`,
        };
    }, [worldEEZData, commitGeoJSONChange, setSelectedPointIds, setSelectedPoints]);

    const undoGeoJSONChange = useCallback(() => {
        if (undoStackRef.current.length === 0) return;
        const current = worldEEZDataRef.current;
        if (current) {
            redoStackRef.current.push(structuredClone(current));
        }
        const previous = undoStackRef.current.pop();
        if (previous) {
            applyGeoJSONState(previous);
            setSelectedPointIds(new Set());
            if (setSelectedPoints) {
                setSelectedPoints([]);
            }
        }
    }, [applyGeoJSONState, setSelectedPoints]);

    const redoGeoJSONChange = useCallback(() => {
        if (redoStackRef.current.length === 0) return;
        const current = worldEEZDataRef.current;
        if (current) {
            undoStackRef.current.push(structuredClone(current));
        }
        const next = redoStackRef.current.pop();
        if (next) {
            applyGeoJSONState(next);
            setSelectedPointIds(new Set());
            if (setSelectedPoints) {
                setSelectedPoints([]);
            }
        }
    }, [applyGeoJSONState, setSelectedPoints]);

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            const mod = event.ctrlKey || event.metaKey;
            if (mod && event.key.toLowerCase() === 'z' && !event.shiftKey) {
                event.preventDefault();
                undoGeoJSONChange();
                return;
            }
            if (mod && (event.key.toLowerCase() === 'y' || (event.key.toLowerCase() === 'z' && event.shiftKey))) {
                event.preventDefault();
                redoGeoJSONChange();
                return;
            }

            if (event.key === 'Delete' || event.key === 'Backspace') {
                if (interactionMode !== 'select' || selectedPointIds.size === 0) {
                    return;
                }
                console.log('Delete key pressed - removing selected points');

                const updatedGeoJSON = removeSelectedPointsFromGeoJSON(selectedPointIds);
                if (updatedGeoJSON) {
                    commitGeoJSONChange(updatedGeoJSON);
                }

                setSelectedPointIds(new Set());
                if (setSelectedPoints) {
                    setSelectedPoints([]);
                }
                setShowDeleteMessage(true);
                setTimeout(() => setShowDeleteMessage(false), 2000);
            }
        };

        document.addEventListener('keydown', handleKeyDown);

        return () => {
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [interactionMode, selectedPointIds, setSelectedPoints, removeSelectedPointsFromGeoJSON, commitGeoJSONChange, undoGeoJSONChange, redoGeoJSONChange]);

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

                const processedData = prepareGeoJSONForEditor(data);

                setWorldEEZData(processedData);

                // Extract polygon points
                const points = extractPolygonPoints(processedData);
                setPolygonPoints(points);
            })
            .catch(error => {
                console.error('Error loading EEZ data:', error);
            });
    }, []);

    useEffect(() => {
        if (!importedGeoJSON) {
            return;
        }
        try {
            const processedData = prepareGeoJSONForEditor(importedGeoJSON.data);
            undoStackRef.current = [];
            redoStackRef.current = [];
            setSelectedPolygonIndex(null);
            setSelectedPointIds(new Set());
            if (setSelectedPoints) {
                setSelectedPoints([]);
            }
            applyGeoJSONState(processedData);
            setGeoJsonKey((prev) => prev + 1);
        } catch (error) {
            console.error('Error loading imported GeoJSON:', error);
            alert(error instanceof Error ? error.message : 'Invalid GeoJSON file');
        } finally {
            onImportedGeoJSONApplied?.();
        }
    }, [importedGeoJSON, applyGeoJSONState, setSelectedPoints, onImportedGeoJSONApplied]);

    // Style function for EEZ polygons
    const styleEEZ = useCallback((feature: any) => {
        const featureIndex = feature.properties?.featureIndex ?? 0;
        const isSelected = selectedPolygonIndex === featureIndex;

        return {
            fillColor: isSelected ? '#007f00' : '#7f0000', // Green if selected, red if not
            weight: isSelected ? 3 : 2, // Thicker border if selected
            opacity: 1,
            color: isSelected ? '#00ff00' : '#ff0000',
            fillOpacity: isSelected ? 0.5 : 0.3 // More opaque if selected
        };
    }, [selectedPolygonIndex]);

    // Event handlers for EEZ polygons
    const onEachFeature = useCallback((feature: any, layer: any) => {
        const featureIndex = feature.properties?.featureIndex ?? 0;

        // Remove any existing click handlers to avoid duplicates
        layer.off('click');

        // Add click handler for polygon selection
        layer.on('click', (e: any) => {
            if (interactionModeRef.current === 'select') {
                return;
            }
            console.log('Polygon clicked:', featureIndex, feature.properties?.Country);
            setSelectedPolygonIndex((currentSelected: number | null) => {
                if (currentSelected === featureIndex) {
                    // If clicking the same polygon, deselect it
                    return null;
                } else {
                    // Select this polygon
                    return featureIndex;
                }
            });
        });

        if (feature.properties && feature.properties.Country) {
            const isCurrentlySelected = selectedPolygonIndex === featureIndex;
            //layer.bindPopup(`<b>${feature.properties.Country}</b><br/>ISO: ${feature.properties.ISO_A3 || 'N/A'}<br/><br/>Click to ${isCurrentlySelected ? 'deselect' : 'select'} this polygon`);
        }
    }, [selectedPolygonIndex]);

    const displayMap = useMemo(
        () => (
            <MapContainer className="map-wrap"
                center={center}
                zoom={zoom}
                boxZoom={false}
                scrollWheelZoom={true}
                ref={setMap}
                whenReady={() => {
                    console.log('Map ready, loading EEZ data...');
                    console.log('EEZ data:', worldEEZData);
                }}>
                <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    noWrap={true}
                />
                <MapPanControl interactionMode={interactionMode} />
                <SelectionBox
                    interactionMode={interactionMode}
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
                                draggable
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
                                            commitGeoJSONChange(updatedGeoJSON);

                                            if (setSelectedPoints && isSelected) {
                                                const updatedPoints = extractPolygonPoints(updatedGeoJSON);
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
        [currentMarkers, worldEEZData, polygonPoints, selectedPolygonIndex, selectedPointIds, interactionMode, showDeleteMessage, updatePointPositionInGeoJSON, extractPolygonPoints, commitGeoJSONChange, setSelectedPoints, geoJsonKey, onEachFeature, styleEEZ],
    )

    return (
        <div className="map-wrap">
            {map ? <DisplayPosition
                map={map}
                setCurrentMarkers={setCurrentMarkers}
                setSelectedTopicGroup={setSelectedTopicGroup}
                interactionMode={interactionMode}
                setInteractionMode={setInteractionMode}
                selectedPolygonIndex={selectedPolygonIndex}
                selectedPointIds={selectedPointIds}
                setSelectedPointIds={setSelectedPointIds}
                setSelectedPoints={setSelectedPoints}
                showDeleteMessage={showDeleteMessage}
                removeSelectedPointsFromGeoJSON={removeSelectedPointsFromGeoJSON}
                setWorldEEZData={setWorldEEZData}
                extractPolygonPoints={extractPolygonPoints}
                setPolygonPoints={setPolygonPoints}
                simplifySelectedPolygon={simplifySelectedPolygon}
            /> : null}
            {displayMap}
        </div>
    )
}