using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace Gluten.Data.PinDescription
{
    public class PinDescriptionCache
    {
        public double GeoLongitude { get; set; }
        public double GeoLatitude { get; set; }
        public string? Description { get; set; }
        public bool? IsGlutenFree { get; set; }
        public List<string> TopicIds { get; set; } = new List<string>();
    }
}
