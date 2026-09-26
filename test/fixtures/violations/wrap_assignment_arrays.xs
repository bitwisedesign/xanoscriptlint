function "example" {
  input {
  }

  stack {
    db.query cms_content {
      where = $db.cms_content.id == $input.id
      return = {type: "list"}
      output = ["itemsReceived", "curPage", "nextPage", "items.id", "items.content_uuid"]
    } as $last
    db.query cms_content {
      where = $db.cms_content.id == $input.id
      return = {type: "list"}
      output = ["itemsReceived", "curPage", "nextPage", "items.id", "items.content_uuid"]
      mock = {empty: {id: 1}}
    } as $sibling
    db.query cms_content {
      where = $db.cms_content.id == $input.id
      return = {type: "list"}
      output = ["itemsReceived", "curPage", "nextPage", "items.id", "items.content_uuid"]
    
      mock = {empty: {id: 1}}
    } as $blank
    var $fields {
      value = ["itemsReceived", "curPage", "nextPage", "items.id", "items.content_uuid"]
      // keep this comment next to this wrap
    }
  }

  response = $ok
}