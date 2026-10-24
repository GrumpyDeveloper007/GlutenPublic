'use client'

import 'bootstrap/dist/css/bootstrap.css';
import Sidebar from './sidebar';
import { TopicGroupClass } from '../_model/model';
import React, { useState, useCallback } from "react";
import dynamic from 'next/dynamic';
import type { GeoJSONImportRequest } from './map';

const DynamicComponentWithNoSSR = dynamic(
  () => import('./map'),
  { ssr: false }
)

export default function Home() {
  const [selectedTopicGroup, setSelectedTopicGroup] = useState<TopicGroupClass>(new TopicGroupClass(999, 999, "test", "test", [], "test", "test", "test", "test"));
  const [selectedPoints, setSelectedPoints] = useState<any[]>([]);
  const [worldEEZData, setWorldEEZData] = useState<any>(null);
  const [importedGeoJSON, setImportedGeoJSON] = useState<GeoJSONImportRequest | null>(null);
  const [originalFileName, setOriginalFileName] = useState<string | null>(null);

  const handleGeoJSONLoaded = useCallback((data: any, fileName: string) => {
    setImportedGeoJSON({ data, id: Date.now() });
    setOriginalFileName(fileName);
  }, []);

  const handleImportedGeoJSONApplied = useCallback(() => {
    setImportedGeoJSON(null);
  }, []);

  return (
    <div className="grid grid-rows-[20px_1fr_20px] items-center justify-items-center min-h-screen p-8 pb-20 gap-16 sm:p-20 font-[family-name:var(--font-geist-sans)]">
      <main className="flex flex-col gap-8 row-start-2 items-center sm:items-start">
        <div className="App">
          <div className="container" style={{ maxWidth: 'none' }}>
            <div className="window-container">
              <div className="master">

                <h1 className="text-danger">Geo JSON editor</h1>
                <DynamicComponentWithNoSSR
                  setSelectedTopicGroup={setSelectedTopicGroup}
                  selectedPoints={selectedPoints}
                  setSelectedPoints={setSelectedPoints}
                  setWorldEEZData={setWorldEEZData}
                  importedGeoJSON={importedGeoJSON}
                  onImportedGeoJSONApplied={handleImportedGeoJSONApplied}
                />
              </div>
              <div className="detail">
                <Sidebar
                  selectedTopicGroup={selectedTopicGroup}
                  selectedPoints={selectedPoints}
                  worldEEZData={worldEEZData}
                  originalFileName={originalFileName}
                  onGeoJSONLoaded={handleGeoJSONLoaded}
                />
              </div>
            </div>
          </div>
        </div>
      </main>
      <footer className="row-start-3 flex gap-6 flex-wrap items-center justify-center">
      </footer>
    </div>
  );
}
