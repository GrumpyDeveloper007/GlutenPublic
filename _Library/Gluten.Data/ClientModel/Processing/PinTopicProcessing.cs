using Gluten.Data.TopicModel;
using System.Collections.Generic;

namespace Gluten.Data.ClientModel.Processing
{
    /// <summary>
    /// Temporary expanded model, containing fields not used by client app
    /// </summary>
    public class PinTopicProcessing : PinTopic
    {
        public List<string> TopicIds { get; set; } = [];
        public List<string> TopicIdsLast { get; set; } = [];

        /// <summary>
        /// Indicates if the pin is present and enabled in the Topic dataset
        /// </summary>
        public bool IsExportable { get; set; }

        public bool DescriptionProcessed { get; set; }
        public string ModelName { get; set; } = "";

        public string Country { get; set; } = "";
    }

}
