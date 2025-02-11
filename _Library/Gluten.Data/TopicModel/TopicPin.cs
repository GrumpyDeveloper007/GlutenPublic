using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace Gluten.Data.TopicModel
{
    public class TopicPin
    {
        public string Label { get; set; } = "";
        public string GeoLatitude { get; set; } = "";
        public string GeoLongitude { get; set; } = "";
        public bool? IsInParent { get; set; }
    }
}
