using Gluten.Data.MapsModel;
using Newtonsoft.Json;

namespace Gluten.Data.Access.DatabaseModel
{
    public class GMapsPinDb : GMapsPin, IDbModel
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
    }
}
