using Gluten.Data.ClientModel;
using Microsoft.Azure.Cosmos;
using Newtonsoft.Json;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace Gluten.Data.Access.DatabaseModel
{

    /// <summary>
    /// Data structure used in the client application, represents a pin on the map
    /// </summary>
    public class PinTopicDb : PinTopic, IDbModel
    {
        public string Country { get; set; } = "";

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
            { return Country; }
        }

        public string GetContainerId()
        {
            return this.GetType().Name;
        }

        private string GetNodeId()
        {
            return $"{GeoLatitude}:{GeoLongitude}";
        }

        private PartitionKey GetPartitionKey()
        {
            return new PartitionKey(Country);
        }
    }


}
