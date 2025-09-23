
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

export interface Topic {
    title: string
    facebookUrl: string
    nodeID: string
    shortTitle: string
    postCreated: Date
}

