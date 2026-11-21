
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
    groupId: string;
    name: string;
    geoLongitudeMin: number | null;
    geoLatitudeMin: number | null;
    geoLongitudeMax: number | null;
    geoLatitudeMax: number | null;
    TotalPins: number | null;
    PublicGroup: boolean | null;
}

type GroupDetailFeature = {
    type: 'Feature';
    properties: GroupDetail & { groupDetailIndex: number; featureIndex: number };
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
        const getField = (key: string): unknown => {
            if (Object.prototype.hasOwnProperty.call(value, key)) {
                return value[key];
            }
            const pascalCaseKey = key.charAt(0).toUpperCase() + key.slice(1);
            return value[pascalCaseKey];
        };
        const groupId = getField('groupId');
        if (typeof groupId !== 'string') {
            throw new Error(`GroupDetail at index ${index} must have a string groupId`);
        }

        const nullableString = (key: string): string | null => {
            const field = getField(key);
            if (field == null) return null;
            if (typeof field !== 'string') {
                throw new Error(`GroupDetail at index ${index} has an invalid ${key}`);
            }
            return field;
        };
        const nullableNumber = (key: string): number | null => {
            const field = getField(key);
            if (field == null) return null;
            if (typeof field !== 'number' || !Number.isFinite(field)) {
                throw new Error(`GroupDetail at index ${index} has an invalid ${key}`);
            }
            return field;
        };
        const defaultString = (key: string): string => {
            const field = getField(key);
            if (field == null) return '';
            if (typeof field !== 'string') {
                throw new Error(`GroupDetail at index ${index} has an invalid ${key}`);
            }
            return field;
        };

        const groupDetail: GroupDetail = {
            groupId,
            name: defaultString('name'),
            geoLongitudeMin: nullableNumber('geoLongitudeMin'),
            geoLatitudeMin: nullableNumber('geoLatitudeMin'),
            geoLongitudeMax: nullableNumber('geoLongitudeMax'),
            geoLatitudeMax: nullableNumber('geoLatitudeMax'),
            TotalPins: nullableNumber('TotalPins'),
            PublicGroup: value.PublicGroup === true || value.publicGroup === true || value.publicgroup === true,
        };

        /*
        if (groupDetail.geoLongitudeMin != null && groupDetail.geoLongitudeMax != null
            && groupDetail.geoLongitudeMin > groupDetail.geoLongitudeMax) {
            throw new Error(`GroupDetail at index ${groupDetail.groupId} has longitude bounds in the wrong order`);
        }
        if (groupDetail.geoLatitudeMin != null && groupDetail.geoLatitudeMax != null
            && groupDetail.geoLatitudeMin > groupDetail.geoLatitudeMax) {
            throw new Error(`GroupDetail at index ${groupDetail.groupId} has latitude bounds in the wrong order`);
        }*/

        return groupDetail;
    });
}

export function groupDetailsToFeatureCollection(data: unknown): GroupDetailFeatureCollection {
    const groupDetails = parseGroupDetails(data);
    const features: GroupDetailFeature[] = [];
    groupDetails.forEach((groupDetail, groupDetailIndex) => {
        const { geoLongitudeMin: geoLongitudeMin, geoLatitudeMin: geoLatitudeMin, geoLongitudeMax: geoLongitudeMax, geoLatitudeMax: geoLatitudeMax } = groupDetail;
        if (geoLongitudeMin == null || geoLatitudeMin == null || geoLongitudeMax == null || geoLatitudeMax == null
            || geoLongitudeMin === geoLongitudeMax || geoLatitudeMin === geoLatitudeMax) {
            return;
        }

        features.push({
            type: 'Feature',
            properties: { ...groupDetail, groupDetailIndex, featureIndex: features.length },
            geometry: {
                type: 'Polygon',
                coordinates: [[
                    [geoLongitudeMin, geoLatitudeMin],
                    [geoLongitudeMax, geoLatitudeMin],
                    [geoLongitudeMax, geoLatitudeMax],
                    [geoLongitudeMin, geoLatitudeMax],
                    [geoLongitudeMin, geoLatitudeMin],
                ]],
            },
        });
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

        const [geoLongitudeMin, geoLatitudeMin, geoLongitudeMax, geoLatitudeMax] = bounds;
        return {
            ...groupDetail,
            geoLongitudeMin,
            geoLatitudeMin,
            geoLongitudeMax,
            geoLatitudeMax,
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
