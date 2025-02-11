using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace Gluten.Data.TopicModel
{
    public class Response
    {
        public string? Message { get; set; }
        public string? NodeId { get; set; }

        public List<TopicLink>? Links { get; set; }
    }
}
