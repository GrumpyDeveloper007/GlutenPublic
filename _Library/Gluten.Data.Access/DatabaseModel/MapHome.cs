// Ignore Spelling: Geo
using Newtonsoft.Json;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace Gluten.Data.Access.DatabaseModel
{
    public class MapHomeDb : IDbModel
    {
        public double GeoLatitude { get; set; }
        public double GeoLongitude { get; set; }

        [JsonProperty(PropertyName = "id")]
        public string Id
        {
            get
            { return GetNodeId(); }
        }

        [JsonProperty(PropertyName = "partitionKey")]
        public string PartitionKey
        {
            get
            { return "None"; }
        }

        public string GetContainerId()
        {
            return this.GetType().Name;
        }

        private string GetNodeId()
        {
            return $"{GeoLatitude}:{GeoLongitude}";
        }
    }

}
