using Gluten.External.Api.Model;
using RestSharp;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace Gluten.External.Api.Service
{
    public class IpInfoService
    {
        public static IpInfo? ReadIpAddressDetails(string ipAddress, string token)
        {
            try
            {
                var options = new RestClientOptions("https://ipinfo.io")
                {
                    //Authenticator = new HttpBasicAuthenticator("username", "password")
                };
                var client = new RestClient(options);
                var request = new RestRequest("{ipaddress}");
                request.AddUrlSegment("ipaddress", ipAddress);
                request.AddQueryParameter("token", token);
                return client.Get<IpInfo>(request);
            }
            catch (Exception ex)
            {
                return null;
            }
        }

    }
}
