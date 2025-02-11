namespace Gluten.Data.PinCache
{
    public class ChainPinCache
    {
        public string? PlaceName { get; set; }
        public string? Label { get; set; }
        public string? MapsUrl { get; set; }
        public string? MetaHtml { get; set; }
        public string? Country { get; set; }
        public List<TopicPinCache> SearchResults { get; set; } = new();
    }
}
