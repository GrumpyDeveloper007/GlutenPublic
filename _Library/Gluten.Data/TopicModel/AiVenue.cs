using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace Gluten.Data.TopicModel
{
    public class AiVenue
    {
        public required string PlaceName { get; set; }
        public string ChainPlaceName { get; set; } = "";
        public string? Address { get; set; }
        public string? City { get; set; }

        public TopicPin? Pin { get; set; }
        public bool PinSearchDone { get; set; } = false;
        public bool IsChain { get; set; } = false;

        public int PinsFound { get; set; } = 0;

        public bool ChainGenerated { get; set; } = false;
        public bool IsExportable { get; set; } = true;
        public bool PermanentlyClosed { get; set; } = false;
        public bool RejectedRestaurantType { get; set; } = false;
        public bool InvalidGeo { get; set; } = false;
    }


    public class AiVenueChain
    {
        public required string PlaceName { get; set; }
        public string ChainPlaceName { get; set; } = "";
        public string? Address { get; set; }
        public string? City { get; set; }

        public TopicPin? Pin { get; set; }
        public bool PinSearchDone { get; set; } = false;
        public int PinsFound { get; set; } = 0;
        public bool IsExportable { get; set; } = true;
        public bool PermanentlyClosed { get; set; } = false;
        public bool RejectedRestaurantType { get; set; } = false;
        public bool InvalidGeo { get; set; } = false;
    }
}
