using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace Gluten.External.Api.Model
{
    public class Currency
    {
        public string code { get; set; }
        public string name { get; set; }
    }

    public class FreeIp
    {
        public int ipVersion { get; set; }
        public string ipAddress { get; set; }
        public double latitude { get; set; }
        public double longitude { get; set; }
        public string countryName { get; set; }
        public string countryCode { get; set; }
        public string timeZone { get; set; }
        public string zipCode { get; set; }
        public string cityName { get; set; }
        public string regionName { get; set; }
        public bool isProxy { get; set; }
        public string continent { get; set; }
        public string continentCode { get; set; }
        public Currency currency { get; set; }
        public string language { get; set; }
        public List<string> timeZones { get; set; }
        public List<string> tlds { get; set; }
    }
}
