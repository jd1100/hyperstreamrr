import React from 'react'

const TitleBar = () => {
  return (
    <div className="title-bar">
      <div className="title-bar-button close" id="close-btn"></div>
      <div className="title-bar-button minimize" id="minimize-btn"></div>
      <div className="title-bar-button maximize" id="maximize-btn"></div>
    </div>
  )
}

export default TitleBar