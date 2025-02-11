// Ignore Spelling: Facebook

using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace Gluten.Data.CommentModel
{
    public class TopicComment
    {
        public string Id { get; set; } = "";
        // parent_post_story
        public string ParentStoryId { get; set; } = "";
        public string Text { get; set; } = "";
        public DateTimeOffset CreatedTime { get; set; }
        //feedback.url
        public string FacebookUrl { get; set; } = "";
    }
}
