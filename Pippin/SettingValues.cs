// Ignore Spelling: Api

using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace Pippin
{
    /// <summary>
    /// Represents the structure of the local.settings.json file
    /// </summary>
    internal class SettingValues
    {
        public required string AIEndPoint { get; set; }
        public required string AIApiKey { get; set; }
        public required string DbEndpointUri { get; set; }
        public required string DbPrimaryKey { get; set; }

        public required string SyncFusionKey { get; set; }
    }
}
