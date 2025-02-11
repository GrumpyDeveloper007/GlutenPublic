namespace Gluten.Data.PinCache
{
    /// <summary>
    /// The details we track for failed searches
    /// </summary>
    public class SkipItemDetails
    {
        /// <summary>
        /// PlaceName
        /// </summary>
        public string PlaceName { get; set; } = "";
        /// <summary>
        /// Country
        /// </summary>
        public string Country { get; set; } = "";
        /// <summary>
        /// City
        /// </summary>
        public string City { get; set; } = "";
        /// <summary>
        /// Address
        /// </summary>
        public string Address { get; set; } = "";
    }
}
