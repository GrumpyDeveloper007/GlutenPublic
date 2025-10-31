'use client'

import React from 'react';
import { TopicGroupClass } from '../_model/model';

const Sidebar = ({
    selectedTopicGroup,
    selectedPoints,
    worldEEZData
}: {
    selectedTopicGroup: TopicGroupClass;
    selectedPoints: any[];
    worldEEZData: any;
}) => {
    // Helper function to format a date
    const dateOnly = (date: Date | string): string => {
        if (typeof date === 'string') {
            return new Date(date).toDateString();
        }
        return date.toDateString();
    };

    // Function to download the current GeoJSON data
    const downloadGeoJSON = () => {
        if (!worldEEZData) {
            alert('No GeoJSON data available to download');
            return;
        }

        // Create a cleaned copy of the data without featureIndex
        const cleanedData = {
            ...worldEEZData,
            features: worldEEZData.features.map((feature: any) => {
                const { featureIndex, ...propertiesWithoutFeatureIndex } = feature.properties || {};
                return {
                    ...feature,
                    properties: propertiesWithoutFeatureIndex
                };
            })
        };

        // Create a JSON string with proper formatting
        const jsonString = JSON.stringify(cleanedData, null, 2);

        // Create a blob with the JSON data
        const blob = new Blob([jsonString], { type: 'application/json' });

        // Create a download link
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'World-EEZ.geo.json';

        // Trigger download
        document.body.appendChild(link);
        link.click();

        // Cleanup
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    return (
        <div style={{ padding: '20px', height: '100vh', overflowY: 'auto' }}>
            <div style={{ marginBottom: '20px', paddingBottom: '15px', borderBottom: '2px solid #ddd' }}>
                <h3 style={{ marginTop: 0 }}>GeoJSON Editor</h3>
                <button
                    onClick={downloadGeoJSON}
                    disabled={!worldEEZData}
                    style={{
                        backgroundColor: worldEEZData ? '#4CAF50' : '#cccccc',
                        color: 'white',
                        border: 'none',
                        padding: '10px 20px',
                        borderRadius: '5px',
                        cursor: worldEEZData ? 'pointer' : 'not-allowed',
                        fontSize: '14px',
                        fontWeight: 'bold',
                        width: '100%',
                        marginTop: '10px'
                    }}
                >
                    📥 Download geo.json
                </button>
                {!worldEEZData && (
                    <p style={{
                        fontSize: '12px',
                        color: '#666',
                        marginTop: '5px',
                        fontStyle: 'italic'
                    }}>
                        Loading data...
                    </p>
                )}
            </div>
            <h3>Selected Points ({selectedPoints.length})</h3>

            {selectedPoints.length === 0 ? (
                <p style={{ color: '#666', fontStyle: 'italic' }}>
                    No points selected. Select a polygon and use the selection box to choose points.
                </p>
            ) : (
                <div>
                    <p style={{
                        color: '#ff6b6b',
                        fontSize: '14px',
                        marginBottom: '15px',
                        padding: '8px',
                        backgroundColor: '#fff5f5',
                        border: '1px solid #ff6b6b',
                        borderRadius: '4px'
                    }}>
                        💡 Press <strong>Delete</strong> or <strong>Backspace</strong> to remove all selected points
                    </p>
                    <div style={{ marginTop: '15px' }}>
                        {selectedPoints.map((point, index) => (
                            <div
                                key={point.id}
                                style={{
                                    border: '1px solid #ddd',
                                    borderRadius: '5px',
                                    padding: '10px',
                                    marginBottom: '10px',
                                    backgroundColor: '#f9f9f9'
                                }}
                            >
                                <div style={{ fontWeight: 'bold', marginBottom: '5px' }}>
                                    Point #{index + 1}
                                </div>
                                <div style={{ fontSize: '14px', color: '#666' }}>
                                    <div><strong>Country:</strong> {point.country}</div>
                                    <div><strong>ISO:</strong> {point.iso}</div>
                                    <div><strong>Feature:</strong> {point.featureIndex}</div>
                                    <div><strong>Point Index:</strong> {point.pointIndex}</div>
                                    <div><strong>Latitude:</strong> {point.position[0].toFixed(6)}</div>
                                    <div><strong>Longitude:</strong> {point.position[1].toFixed(6)}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default Sidebar;
