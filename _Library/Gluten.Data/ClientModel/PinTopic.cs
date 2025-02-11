using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace Gluten.Data.ClientModel
{
    /// <summary>
    /// Data structure used in the client application, represents a pin on the map
    /// </summary>
    public class PinTopic
    {
        public double GeoLongitude { get; set; }
        public double GeoLatitude { get; set; }
        public string Label { get; set; } = "";
        public string PlaceName { get; set; } = "";
        public string? Description { get; set; }
        public List<PinLinkInfo> Topics { get; set; } = [];
        public string? MapsLink { get; set; }
        public string? RestaurantType { get; set; }
        public string? Price { get; set; }
        public string? Stars { get; set; }
        public bool? IsGF { get; set; }
        /// <summary>
        /// Is Chain
        /// </summary>
        public bool? IsC { get; set; }
        /// <summary>
        /// Gluten free group
        /// </summary>
        public bool? IsGFG { get; set; }
    }

}
