// Ignore Spelling: Facebook

namespace Gluten.Data.TopicModel
{
    public class DetailedTopic
    {
        public string? TitleCountry { get; set; }

        public string? TitleCity { get; set; }
        public string TitleCategory { get; set; } = "";
        public string TitleLanguage { get; set; } = "";
        public string TitleEnglish { get; set; } = "";
        public bool CitySearchDone { get; set; } = false;
        public required string Title { get; set; }
        public string? ShortTitle { get; set; }
        public bool ShortTitleProcessed { get; set; } = false;

        public string FacebookUrl { get; set; } = "";
        public string NodeID { get; set; } = "";

        public List<AiVenue>? AiVenues { get; set; }
        public List<AiVenue>? AiVenueChains { get; set; } = [];

        public bool IsAiVenuesSearchDone { get; set; } = false;

        public List<TopicLink>? UrlsV2 { get; set; }

        public List<Response> ResponsesV2 { get; set; } = [];

        public string GroupId { get; set; } = "";
        public DateTimeOffset? PostCreated { get; set; }

        public bool AiIsQuestion { get; set; }
    }
}
