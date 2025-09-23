import * as turf from '@turf/turf';
import countriesGeoJSON2 from '../../staticdata/World-EEZ.geo.json';

class MapDataService {
    // Get countries within a map's visible bounds
    getCountriesInView(bounds: any): string[] {
        const southwest = bounds.getSouthWest();
        const northeast = bounds.getNorthEast();

        // Filter GeoJSON features that intersect the visible bounding box
        const countriesInView = countriesGeoJSON2.features.filter((feature: any) =>
            turf.booleanIntersects(
                feature.geometry,
                turf.bboxPolygon([southwest.lng, southwest.lat, northeast.lng, northeast.lat])
            )
        );

        // Return the list of country names
        return countriesInView.map((feature: any) => feature.properties.Country);
    }

    // Get countries at a specific map point
    getCountriesInViewPoint(bounds: any) {
        // Filter GeoJSON features that intersect the given point
        const countriesInView = countriesGeoJSON2.features.filter((feature: any) =>
            turf.booleanIntersects(feature.geometry, turf.point([bounds.lng, bounds.lat]))
        );

        // Return the list of country names
        return countriesInView.map((feature: any) => feature.properties.Country);
    }
}

const mapDataService = new MapDataService();

export default mapDataService;
