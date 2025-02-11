using Newtonsoft.Json;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace Gluten.Data.Access.DatabaseModel
{
    public class DataQueryDb : IDbModel
    {
        public string IpAddress { get; set; } = "";
        public string Countries { get; set; } = "";

        public DateTimeOffset Date { get; set; } = DateTimeOffset.Now;

        public Guid Guid { get; set; } = Guid.NewGuid();


        [JsonProperty(PropertyName = "partitionKey")]
        public string PartitionKey
        {
            get
            { return "None"; }
        }

        [JsonProperty(PropertyName = "id")]
        public string Id
        {
            get
            { return GetNodeId(); }
        }

        public string GetContainerId()
        {
            return this.GetType().Name;
        }

        private string GetNodeId()
        {
            return $"{Guid}";
        }
    }
}
