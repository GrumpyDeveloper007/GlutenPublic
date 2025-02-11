using AutoMapper;
using Gluten.Data.Access.DatabaseModel;
using Gluten.Data.ClientModel;
using Gluten.Data.MapsModel;

namespace Gluten.Data.Access.Service
{
    /// <summary>
    /// Auto mapper helper service
    /// </summary>
    public class DbMapperService
    {
        private readonly IMapper _mapper;

        /// <summary>
        /// Constructor
        /// </summary>
        public DbMapperService()
        {
            var config = new MapperConfiguration(cfg =>
            {
                cfg.CreateMap<PinTopic, PinTopicDb>();
                cfg.CreateMap<PinTopicDb, PinTopic>();
                cfg.CreateMap<GMapsPin, GMapsPinDb>();
                cfg.CreateMap<GMapsPinDb, GMapsPin>();

            });

            _mapper = config.CreateMapper();
        }

        /// <summary>
        /// Converts one type to another
        /// </summary>
        public outputType Map<outputType, inputType>(inputType inputData)
        {
            return _mapper.Map<outputType>(inputData);
        }
    }
}
