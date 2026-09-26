function "example" {
  input {
  }

  stack {
    db.query item {
      output = ["itemsReceived", "curPage", "nextPage", "xxxxxxxxxxxxxxxxxxxxxx"]
    } as $item
    var $joined {
      value = ["itemsReceived", "curPage", "nextPage", "items.id", "items.content_uuid"]|join:","
    }
    var $offsets {
      value = [0, 1, 2, 3, 4, 5, 6, 7]
    }
  }

  response = $item
}