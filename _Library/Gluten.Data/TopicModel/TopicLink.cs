using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace Gluten.Data.TopicModel
{
    public class TopicLink
    {
        public required string Url { get; set; }
        public TopicPin? Pin { get; set; }
    }
}
