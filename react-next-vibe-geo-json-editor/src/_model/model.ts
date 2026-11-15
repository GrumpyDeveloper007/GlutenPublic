
export class TopicGroupClass {
    constructor(
        public geoLongitude: number,
        public geoLatitude: number,
        public label: string,
        public description: string,
        public topics: Topic[],
        public mapsLink: string,
        public restaurantType: string,
        public price: string,
        public stars: string,
    ) { }
}

export interface GroupDetail {
    GroupId: string;
    Name: string;
    OriginalName: string | null;
    AboutText: string | null;
    GeoLongitudeMin: number | null;
    GeoLatitudeMin: number | null;
    GeoLongitudeMax: number | null;
    GeoLatitudeMax: number | null;
    Notes: string;
}

type GroupDetailFeature = {
    type: 'Feature';
    properties: GroupDetail & { groupDetailIndex: number };
    geometry: {
        type: 'Polygon';
        coordinates: number[][][];
    };
};

export type GroupDetailFeatureCollection = {
    type: 'FeatureCollection';
    features: GroupDetailFeature[];
    groupDetails: GroupDetail[];
};

export function parseGroupDetails(data: unknown): GroupDetail[] {
    if (!Array.isArray(data)) {
        throw new Error('Expected a JSON array of GroupDetail records');
    }

    return data.map((record: unknown, index: number) => {
        if (!record || typeof record !== 'object' || Array.isArray(record)) {
            throw new Error(`GroupDetail at index ${index} must be an object`);
        }

        const value = record as Record<string, unknown>;
        if (typeof value.GroupId !== 'string') {
            throw new Error(`GroupDetail at index ${index} must have a string GroupId`);
        }

        const nullableString = (key: string): string | null => {
            const field = value[key];
            if (field == null) return null;
            if (typeof field !== 'string') {
                throw new Error(`GroupDetail at index ${index} has an invalid ${key}`);
            }
            return field;
        };
        const nullableNumber = (key: string): number | null => {
            const field = value[key];
            if (field == null) return null;
            if (typeof field !== 'number' || !Number.isFinite(field)) {
                throw new Error(`GroupDetail at index ${index} has an invalid ${key}`);
            }
            return field;
        };
        const defaultString = (key: string): string => {
            const field = value[key];
            if (field == null) return '';
            if (typeof field !== 'string') {
                throw new Error(`GroupDetail at index ${index} has an invalid ${key}`);
            }
            return field;
        };

        const groupDetail: GroupDetail = {
            GroupId: value.GroupId,
            Name: defaultString('Name'),
            OriginalName: nullableString('OriginalName'),
            AboutText: nullableString('AboutText'),
            GeoLongitudeMin: nullableNumber('GeoLongitudeMin'),
            GeoLatitudeMin: nullableNumber('GeoLatitudeMin'),
            GeoLongitudeMax: nullableNumber('GeoLongitudeMax'),
            GeoLatitudeMax: nullableNumber('GeoLatitudeMax'),
            Notes: defaultString('Notes'),
        };

        if (groupDetail.GeoLongitudeMin != null && groupDetail.GeoLongitudeMax != null
            && groupDetail.GeoLongitudeMin > groupDetail.GeoLongitudeMax) {
            throw new Error(`GroupDetail at index ${index} has longitude bounds in the wrong order`);
        }
        if (groupDetail.GeoLatitudeMin != null && groupDetail.GeoLatitudeMax != null
            && groupDetail.GeoLatitudeMin > groupDetail.GeoLatitudeMax) {
            throw new Error(`GroupDetail at index ${index} has latitude bounds in the wrong order`);
        }

        return groupDetail;
    });
}

export function groupDetailsToFeatureCollection(data: unknown): GroupDetailFeatureCollection {
    const groupDetails = parseGroupDetails(data);
    const features = groupDetails.flatMap((groupDetail, groupDetailIndex): GroupDetailFeature[] => {
        const { GeoLongitudeMin, GeoLatitudeMin, GeoLongitudeMax, GeoLatitudeMax } = groupDetail;
        if (GeoLongitudeMin == null || GeoLatitudeMin == null || GeoLongitudeMax == null || GeoLatitudeMax == null
            || GeoLongitudeMin === GeoLongitudeMax || GeoLatitudeMin === GeoLatitudeMax) {
            return [];
        }

        return [{
            type: 'Feature',
            properties: { ...groupDetail, groupDetailIndex },
            geometry: {
                type: 'Polygon',
                coordinates: [[
                    [GeoLongitudeMin, GeoLatitudeMin],
                    [GeoLongitudeMax, GeoLatitudeMin],
                    [GeoLongitudeMax, GeoLatitudeMax],
                    [GeoLongitudeMin, GeoLatitudeMax],
                    [GeoLongitudeMin, GeoLatitudeMin],
                ]],
            },
        }];
    });

    return { type: 'FeatureCollection', features, groupDetails };
}

function geometryBounds(geometry: unknown): [number, number, number, number] | null {
    if (!geometry || typeof geometry !== 'object' || !('coordinates' in geometry)) return null;
    const positions: [number, number][] = [];
    const collectPositions = (coordinates: unknown): void => {
        if (!Array.isArray(coordinates)) return;
        if (coordinates.length >= 2 && typeof coordinates[0] === 'number' && typeof coordinates[1] === 'number') {
            if (Number.isFinite(coordinates[0]) && Number.isFinite(coordinates[1])) {
                positions.push([coordinates[0], coordinates[1]]);
            }
            return;
        }
        coordinates.forEach(collectPositions);
    };
    collectPositions(geometry.coordinates);
    if (positions.length === 0) return null;

    return [
        Math.min(...positions.map(([longitude]) => longitude)),
        Math.min(...positions.map(([, latitude]) => latitude)),
        Math.max(...positions.map(([longitude]) => longitude)),
        Math.max(...positions.map(([, latitude]) => latitude)),
    ];
}

export function featureCollectionToGroupDetails(data: GroupDetailFeatureCollection): GroupDetail[] {
    const featuresByIndex = new Map<number, GroupDetailFeature>();
    data.features.forEach((feature) => {
        const index = feature.properties.groupDetailIndex;
        if (Number.isInteger(index)) featuresByIndex.set(index, feature);
    });

    return data.groupDetails.map((groupDetail, index) => {
        const bounds = geometryBounds(featuresByIndex.get(index)?.geometry);
        if (!bounds) return { ...groupDetail };

        const [GeoLongitudeMin, GeoLatitudeMin, GeoLongitudeMax, GeoLatitudeMax] = bounds;
        return {
            ...groupDetail,
            GeoLongitudeMin,
            GeoLatitudeMin,
            GeoLongitudeMax,
            GeoLatitudeMax,
        };
    });
}

export interface Topic {
    title: string
    facebookUrl: string
    nodeID: string
    shortTitle: string
    postCreated: Date
}
