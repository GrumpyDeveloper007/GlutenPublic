namespace Gluten.Data.PinCache
{
    public class TopicPinCache
    {
        public required string PlaceName { get; set; }
        public required string Label { get; set; }
        public string GeoLatitude { get; set; } = "";
        public string GeoLongitude { get; set; } = "";
        public string? MapsUrl { get; set; }
        public PinCacheMeta? MetaData { get; set; }
        public bool MetaProcessed { get; set; } = false;
        public string? Country { get; set; }
        public List<string> SearchStrings { get; set; } = [];
        public DateTimeOffset LastMetaUpdateDate { get; set; } = DateTimeOffset.MinValue;
    }
}
