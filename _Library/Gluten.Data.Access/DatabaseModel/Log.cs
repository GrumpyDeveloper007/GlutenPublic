// Ignore Spelling: Geo
using Newtonsoft.Json;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace Gluten.Data.Access.DatabaseModel
{
    public class LogDb : IDbModel
    {
        public Guid LogId { get; set; } = Guid.NewGuid();
        public string Message { get; set; }

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
            return $"{LogId}";
        }
    }

}
